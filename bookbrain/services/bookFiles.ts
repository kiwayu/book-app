/*
 * book_files row access. One file per book at launch (design doc);
 * the schema permits more but the import flow treats a duplicate
 * content hash as "already in library".
 */

import { execute, getOne } from "@/db/database";

export type BookFileType = "epub" | "pdf";

export interface BookFileRow {
  id: number;
  book_id: number;
  file_path: string;
  file_type: BookFileType;
  file_size: number | null;
  content_hash: string | null;
  imported_at: string;
}

export async function getFileForBook(
  bookId: number
): Promise<BookFileRow | null> {
  return getOne<BookFileRow>(
    `SELECT * FROM book_files WHERE book_id = ? LIMIT 1`,
    [bookId]
  );
}

export async function findFileByHash(
  hash: string
): Promise<BookFileRow | null> {
  return getOne<BookFileRow>(
    `SELECT * FROM book_files WHERE content_hash = ? LIMIT 1`,
    [hash]
  );
}

export async function insertBookFile(row: {
  book_id: number;
  file_path: string;
  file_type: BookFileType;
  file_size: number | null;
  content_hash: string | null;
}): Promise<void> {
  await execute(
    `INSERT INTO book_files (book_id, file_path, file_type, file_size, content_hash)
     VALUES (?, ?, ?, ?, ?)`,
    [row.book_id, row.file_path, row.file_type, row.file_size, row.content_hash]
  );
}

/** A row is "remote" when its path is a URL rather than a local file. */
export function isRemotePath(filePath: string): boolean {
  return /^https?:\/\//i.test(filePath);
}
