import { execute, getOne } from "@/db/database";

export interface ReadingSession {
  id: number;
  book_id: number;
  start_time: string;
  end_time: string | null;
  pages_read: number;
}

export interface ReadingProgress {
  book_id: number;
  current_page: number;
  percentage: number;
  last_opened: string;
  cfi: string | null;
}

const now = () => new Date().toISOString();

export async function startSession(bookId: number): Promise<number> {
  const result = await execute(
    "INSERT INTO reading_sessions (book_id, start_time, pages_read) VALUES (?, ?, 0)",
    [bookId, now()]
  );
  return result.lastInsertRowId;
}

export async function endSession(
  sessionId: number,
  pagesRead: number
): Promise<void> {
  await execute(
    "UPDATE reading_sessions SET end_time = ?, pages_read = ? WHERE id = ?",
    [now(), pagesRead, sessionId]
  );
}

export async function updateProgress(
  bookId: number,
  currentPage: number,
  percentage: number,
  cfi?: string | null
): Promise<void> {
  await execute(
    `INSERT INTO reading_progress (book_id, current_page, percentage, last_opened, cfi)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(book_id) DO UPDATE SET
       current_page = excluded.current_page,
       percentage   = excluded.percentage,
       last_opened  = excluded.last_opened,
       cfi          = COALESCE(excluded.cfi, reading_progress.cfi)`,
    [bookId, currentPage, percentage, now(), cfi ?? null]
  );
}

/**
 * Touch `last_opened` without changing page or percentage.
 * Creates a progress row if one doesn't exist yet.
 */
export async function touchLastOpened(bookId: number): Promise<void> {
  await execute(
    `INSERT INTO reading_progress (book_id, current_page, percentage, last_opened)
     VALUES (?, 0, 0, ?)
     ON CONFLICT(book_id) DO UPDATE SET last_opened = excluded.last_opened`,
    [bookId, now()]
  );
}

/**
 * Set progress to 100% (used when marking a book as finished from the UI).
 */
export async function markProgressComplete(
  bookId: number,
  totalPages: number | null
): Promise<void> {
  const pages = totalPages ?? 0;
  await execute(
    `INSERT INTO reading_progress (book_id, current_page, percentage, last_opened)
     VALUES (?, ?, 100, ?)
     ON CONFLICT(book_id) DO UPDATE SET
       current_page = excluded.current_page,
       percentage   = 100,
       last_opened  = excluded.last_opened`,
    [bookId, pages, now()]
  );
}

export async function getProgress(
  bookId: number
): Promise<ReadingProgress | null> {
  return getOne<ReadingProgress>(
    "SELECT * FROM reading_progress WHERE book_id = ?",
    [bookId]
  );
}

export async function getActiveSession(
  bookId: number
): Promise<ReadingSession | null> {
  return getOne<ReadingSession>(
    "SELECT * FROM reading_sessions WHERE book_id = ? AND end_time IS NULL ORDER BY start_time DESC",
    [bookId]
  );
}
