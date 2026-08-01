/*
 * One-time migration: AsyncStorage epub_paths map -> book_files table.
 * (Design doc workstream 1, execution model per eng review D15.)
 *
 *   epub_paths map entry (bookId -> uri)
 *        │
 *        ├─ book row gone ──────────────▶ drop key (orphan)
 *        ├─ http(s):// URL ─────────────▶ row: path=url, hash=NULL
 *        │                                ("remote — download to keep
 *        │                                 offline"; NO network here)
 *        ├─ local file exists ──────────▶ copy into books/, hash, row
 *        └─ local file missing ─────────▶ row: original path, hash=NULL
 *                                         ("file missing — re-import")
 *
 * Idempotency is per-entry: each key is REMOVED from the map as its row
 * lands, so a crash mid-migration resumes with the remaining keys and
 * never duplicates (NULL hashes don't dedupe — UNIQUE permits NULLs).
 * A book that already has ANY book_files row is skipped defensively.
 * The done-marker in app_settings ends the startup check; it is written
 * only when every key has been consumed, so failed entries retry on the
 * next launch.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { execute, getOne } from "@/db/database";
import { getFileForBook, insertBookFile, isRemotePath } from "./bookFiles";
import { hashFile } from "./contentHash";
import { safeStorageName } from "./fileValidation";

const PATHS_KEY = "epub_paths"; // legacy key from services/epubPaths.ts
const DONE_MARKER = "epub_paths_migrated";

type EpubPathMap = Record<string, string>;

export interface MigrationResult {
  migrated: number;
  remote: number;
  missing: number;
  orphaned: number;
  failed: number;
  skipped: boolean; // done-marker already present
}

async function isDone(): Promise<boolean> {
  const row = await getOne<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = ?`,
    [DONE_MARKER]
  );
  return row?.value === "1";
}

async function markDone(): Promise<void> {
  await execute(
    `INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, '1')`,
    [DONE_MARKER]
  );
}

async function readMap(): Promise<EpubPathMap> {
  try {
    const raw = await AsyncStorage.getItem(PATHS_KEY);
    return raw ? (JSON.parse(raw) as EpubPathMap) : {};
  } catch {
    return {};
  }
}

async function removeKey(key: string): Promise<void> {
  const map = await readMap();
  delete map[key];
  await AsyncStorage.setItem(PATHS_KEY, JSON.stringify(map));
}

async function bookExists(bookId: number): Promise<boolean> {
  const row = await getOne<{ id: number }>(
    `SELECT id FROM books WHERE id = ?`,
    [bookId]
  );
  return row != null;
}

/** Copy a legacy local file into documentDirectory/books/ if it isn't there. */
async function ensureInBooksDir(uri: string): Promise<string> {
  const booksDir = `${FileSystem.documentDirectory}books/`;
  if (uri.startsWith(booksDir)) return uri;
  await FileSystem.makeDirectoryAsync(booksDir, { intermediates: true });
  const name = safeStorageName(uri.split(/[\\/]/).pop() ?? "book.epub");
  const dest = `${booksDir}${name}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

async function migrateEntry(
  bookId: number,
  uri: string,
  result: MigrationResult
): Promise<void> {
  if (!(await bookExists(bookId))) {
    result.orphaned++;
    return;
  }
  // Crash-resume guard: a prior partial run may already have landed this row.
  if ((await getFileForBook(bookId)) != null) {
    result.migrated++;
    return;
  }

  if (isRemotePath(uri)) {
    // No network at startup (D15): store the URL; download is a user action.
    await insertBookFile({
      book_id: bookId,
      file_path: uri,
      file_type: "epub",
      file_size: null,
      content_hash: null,
    });
    result.remote++;
    return;
  }

  const info = await FileSystem.getInfoAsync(uri);
  if (info.exists && !info.isDirectory) {
    const stored = await ensureInBooksDir(uri);
    const hashed = await hashFile(stored);
    await insertBookFile({
      book_id: bookId,
      file_path: stored,
      file_type: "epub",
      file_size: hashed?.size ?? null,
      content_hash: hashed?.hash ?? null,
    });
    result.migrated++;
  } else {
    // "file missing — re-import" state: keep the book, keep the dead path.
    await insertBookFile({
      book_id: bookId,
      file_path: uri,
      file_type: "epub",
      file_size: null,
      content_hash: null,
    });
    result.missing++;
  }
}

/**
 * Run the migration. Safe to call on every app launch: exits immediately
 * once the done-marker is set, and is resume-safe before that.
 */
export async function migrateEpubPaths(): Promise<MigrationResult> {
  const result: MigrationResult = {
    migrated: 0,
    remote: 0,
    missing: 0,
    orphaned: 0,
    failed: 0,
    skipped: false,
  };

  if (await isDone()) {
    result.skipped = true;
    return result;
  }

  const map = await readMap();
  for (const [key, uri] of Object.entries(map)) {
    const bookId = Number(key);
    try {
      if (!Number.isInteger(bookId) || typeof uri !== "string" || !uri) {
        result.orphaned++; // malformed legacy entry — consume it
      } else {
        await migrateEntry(bookId, uri, result);
      }
      await removeKey(key); // per-entry idempotency: consumed only on success
    } catch {
      result.failed++; // key stays in the map; retried next launch
    }
  }

  if (result.failed === 0) {
    await markDone();
  }
  return result;
}
