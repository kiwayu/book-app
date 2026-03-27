import { execute, getAll, getOne } from "@/db/database";

/* ── Types ──────────────────────────────────────── */

export interface Bookmark {
  id: number;
  book_id: number;
  cfi: string;
  label: string | null;
  page_number: number | null;
  created_at: string;
}

/* ── Bookmark CRUD ──────────────────────────────── */

export async function addBookmark(
  bookId: number,
  cfi: string,
  label?: string,
  pageNumber?: number
): Promise<number> {
  const result = await execute(
    `INSERT INTO bookmarks (book_id, cfi, label, page_number)
     VALUES (?, ?, ?, ?)`,
    [bookId, cfi, label ?? null, pageNumber ?? null]
  );
  return result.insertId!;
}

export async function updateBookmarkLabel(
  id: number,
  label: string
): Promise<void> {
  await execute(`UPDATE bookmarks SET label = ? WHERE id = ?`, [label, id]);
}

export async function deleteBookmark(id: number): Promise<void> {
  await execute(`DELETE FROM bookmarks WHERE id = ?`, [id]);
}

export async function getBookmarksForBook(
  bookId: number
): Promise<Bookmark[]> {
  return getAll<Bookmark>(
    `SELECT * FROM bookmarks WHERE book_id = ? ORDER BY page_number, created_at`,
    [bookId]
  );
}

export async function getBookmarkCount(bookId: number): Promise<number> {
  const row = await getOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM bookmarks WHERE book_id = ?`,
    [bookId]
  );
  return row?.count ?? 0;
}

/* ── Helpers ─────────────────────────────────────── */

export async function isPageBookmarked(
  bookId: number,
  cfi: string
): Promise<boolean> {
  const row = await getOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM bookmarks WHERE book_id = ? AND cfi = ?`,
    [bookId, cfi]
  );
  return (row?.count ?? 0) > 0;
}

export async function toggleBookmark(
  bookId: number,
  cfi: string,
  pageNumber?: number
): Promise<{ added: boolean; id?: number }> {
  const existing = await getOne<{ id: number }>(
    `SELECT id FROM bookmarks WHERE book_id = ? AND cfi = ?`,
    [bookId, cfi]
  );

  if (existing) {
    await deleteBookmark(existing.id);
    return { added: false };
  }

  const id = await addBookmark(bookId, cfi, undefined, pageNumber);
  return { added: true, id };
}
