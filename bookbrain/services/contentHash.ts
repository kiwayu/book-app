/*
 * Partial content hash for import dedupe (design doc, eng review D20).
 *
 *   content_hash = SHA-256( size | base64(first 1MB) | base64(last 1MB) )
 *
 * Never reads the whole file: a 60MB scanned PDF as one base64 string is
 * the exact OOM pattern the design rejected for WebView bridging. The
 * positioned reads REQUIRE the expo-file-system/legacy import on SDK 54,
 * and position/length only work with base64 encoding.
 *
 * Collisions (same size + head + tail, different middle) are accepted:
 * the import flow shows "already in library" with an "import anyway"
 * override, so a collision can never silently drop a book.
 */

import * as FileSystem from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";

export const HASH_CHUNK_BYTES = 1024 * 1024; // 1MB

/** Pure composition of the digest input — exported for tests. */
export function composeHashInput(
  size: number,
  headB64: string,
  tailB64: string
): string {
  return `${size}|${headB64}|${tailB64}`;
}

export interface FileHash {
  hash: string;
  size: number;
}

/**
 * Hash a local file. Returns null when the file does not exist.
 * For files <= 1MB the head covers everything and the tail is empty;
 * otherwise the tail reads from max(size - 1MB, 1MB) so head and tail
 * never overlap.
 */
export async function hashFile(uri: string): Promise<FileHash | null> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || info.isDirectory) return null;
  const size = info.size ?? 0;

  const head = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
    position: 0,
    length: Math.min(HASH_CHUNK_BYTES, size),
  });

  let tail = "";
  if (size > HASH_CHUNK_BYTES) {
    const tailStart = Math.max(size - HASH_CHUNK_BYTES, HASH_CHUNK_BYTES);
    tail = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      position: tailStart,
      length: size - tailStart,
    });
  }

  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    composeHashInput(size, head, tail)
  );
  return { hash, size };
}
