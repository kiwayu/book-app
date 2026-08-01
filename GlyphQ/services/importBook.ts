/*
 * Library "Add from device": file picker -> book + library entry +
 * book_files row, deduped by content hash. Also resolves where a book's
 * epub lives (book_files first, legacy AsyncStorage epub_paths fallback)
 * so the reader can open books imported either way.
 */

import { execute, withTransaction } from "@/db/database";
import { getEpubPath } from "./epubPaths";
import { hashFile } from "./contentHash";
import {
  getFileForBook,
  findFileByHash,
  insertBookFile,
  isRemotePath,
} from "./bookFiles";
import {
  pickAndStoreLocalEbook,
  removeStoredEbook,
  ImportValidationError,
} from "./localEpub";

export interface ImportedBook {
  bookId: number;
  title: string;
  duplicate: boolean;
}

/** "My_Great_Book.epub" -> "My Great Book" */
function titleFromFileName(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim() || "Untitled";
}

/**
 * Pick an epub from the device and add it to the library.
 * Returns null when the user cancels; { duplicate: true } when the same
 * content is already in the library (no new rows written).
 */
export async function importBookFromDevice(): Promise<ImportedBook | null> {
  const picked = await pickAndStoreLocalEbook();
  if (!picked) return null;

  // The file is already copied into books/; from here on, any exit that
  // doesn't keep the book must delete that copy or it leaks forever.
  try {
    if (picked.kind !== "epub") {
      throw new ImportValidationError("PDF support lands later — pick an .epub for now.");
    }

    const title = titleFromFileName(picked.originalName);
    const hashed = await hashFile(picked.uri);

    if (hashed) {
      const existing = await findFileByHash(hashed.hash);
      if (existing) {
        await removeStoredEbook(picked.uri);
        return { bookId: existing.book_id, title, duplicate: true };
      }
    }

    // One transaction: never a book row without its entry + file row.
    return await withTransaction(async () => {
      const inserted = await execute(
        `INSERT INTO books (title) VALUES (?)`,
        [title]
      );
      const bookId = inserted.lastInsertRowId;

      await execute(
        `INSERT INTO library_entries (book_id, status, date_added)
         VALUES (?, ?, ?)`,
        [bookId, "want_to_read", new Date().toISOString()]
      );

      await insertBookFile({
        book_id: bookId,
        file_path: picked.uri,
        file_type: "epub",
        file_size: hashed?.size ?? picked.size ?? null,
        content_hash: hashed?.hash ?? null,
      });

      return { bookId, title, duplicate: false };
    });
  } catch (e) {
    await removeStoredEbook(picked.uri);
    throw e;
  }
}

/**
 * Delete a book's stored file from disk (no-op for remote URLs or books
 * without a file row). DB rows are handled by ON DELETE CASCADE; this is
 * the disk half of deleting a book.
 */
export async function removeBookFileFromDisk(bookId: number): Promise<void> {
  const row = await getFileForBook(bookId);
  if (row?.file_path && !isRemotePath(row.file_path)) {
    await removeStoredEbook(row.file_path);
  }
}

/** Where does this book's epub live? book_files wins; legacy map as fallback. */
export async function resolveBookSource(bookId: number): Promise<string | null> {
  const row = await getFileForBook(bookId);
  if (row?.file_path) return row.file_path;
  return getEpubPath(bookId);
}
