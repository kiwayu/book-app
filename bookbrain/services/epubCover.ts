/*
 * Save an epub's cover (extracted in the reader WebView via epub.js) to disk
 * and point books.cover_url at it. The existing shelf UI renders cover_url
 * with <Image source={{uri}}>, so a file:// path is all it needs.
 */

import * as FileSystem from "expo-file-system/legacy";
import { execute, getOne } from "@/db/database";

const COVERS_DIR = () => `${FileSystem.documentDirectory}covers/`;

/** True when the book already has any cover (remote or extracted) — don't clobber it. */
export async function hasCover(bookId: number): Promise<boolean> {
  const row = await getOne<{ cover_url: string | null }>(
    "SELECT cover_url FROM books WHERE id = ?",
    [bookId]
  );
  return !!row?.cover_url;
}

/** Split a "data:image/jpeg;base64,AAAA" URL into a file extension + payload. */
export function parseCoverDataUrl(
  dataUrl: string
): { ext: string; base64: string } | null {
  const m = /^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/s.exec(dataUrl);
  if (!m) return null;
  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  return { ext, base64: m[2] };
}

/** Write the cover file and set books.cover_url. Returns the saved uri, or null. */
export async function saveCover(
  bookId: number,
  dataUrl: string
): Promise<string | null> {
  const parsed = parseCoverDataUrl(dataUrl);
  if (!parsed) return null;
  await FileSystem.makeDirectoryAsync(COVERS_DIR(), { intermediates: true });
  const dest = `${COVERS_DIR()}book-${bookId}.${parsed.ext}`;
  await FileSystem.writeAsStringAsync(dest, parsed.base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await execute("UPDATE books SET cover_url = ? WHERE id = ?", [dest, bookId]);
  return dest;
}
