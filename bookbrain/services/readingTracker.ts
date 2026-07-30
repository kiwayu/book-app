import { execute, getOne } from "@/db/database";

/** How a session was read. Validated here, not by the schema: SQLite cannot
 *  ALTER ADD a CHECK constraint onto an existing table. */
export type ReadingMode = "page" | "rsvp";

export interface ReadingSession {
  id: number;
  book_id: number;
  start_time: string;
  end_time: string | null;
  pages_read: number;
  /** Words streamed in RSVP; 0 for page reading. */
  words_read: number;
  mode: ReadingMode;
  /** WPM the reader ended on. Not an average — see TODOS if weighting matters. */
  wpm_last: number | null;
}

export interface ReadingProgress {
  book_id: number;
  current_page: number;
  percentage: number;
  last_opened: string;
  cfi: string | null;
  /** Word index reached in RSVP speed-reading; NULL once normal reading resumes. */
  rsvp_word_index: number | null;
}

const now = () => new Date().toISOString();

export async function startSession(
  bookId: number,
  mode: ReadingMode = "page"
): Promise<number> {
  const result = await execute(
    "INSERT INTO reading_sessions (book_id, start_time, pages_read, mode) VALUES (?, ?, 0, ?)",
    [bookId, now(), mode === "rsvp" ? "rsvp" : "page"]
  );
  return result.lastInsertRowId;
}

/** Words and WPM are only meaningful for an RSVP session; omit them otherwise. */
export async function endSession(
  sessionId: number,
  pagesRead: number,
  rsvp?: { wordsRead: number; wpmLast: number }
): Promise<void> {
  await execute(
    `UPDATE reading_sessions
        SET end_time   = ?,
            pages_read = ?,
            words_read = ?,
            wpm_last   = COALESCE(?, wpm_last)
      WHERE id = ?`,
    [now(), pagesRead, rsvp?.wordsRead ?? 0, rsvp?.wpmLast ?? null, sessionId]
  );
}

/**
 * `keepRsvp` exists because the speed reader's own close-time seek is a real
 * navigation: it fires `relocated`, which lands here. Without the flag that
 * write NULLs the resume pointer the reader just saved (D16 clears the pointer
 * when NORMAL reading resumes, which a close-time seek is not).
 */
export async function updateProgress(
  bookId: number,
  currentPage: number,
  percentage: number,
  cfi?: string | null,
  keepRsvp = false
): Promise<void> {
  await execute(
    `INSERT INTO reading_progress (book_id, current_page, percentage, last_opened, cfi)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(book_id) DO UPDATE SET
       current_page    = excluded.current_page,
       percentage      = excluded.percentage,
       last_opened     = excluded.last_opened,
       cfi             = COALESCE(excluded.cfi, reading_progress.cfi),
       rsvp_word_index = ${keepRsvp ? "reading_progress.rsvp_word_index" : "NULL"}`,
    [bookId, currentPage, percentage, now(), cfi ?? null]
  );
}

/**
 * Persist (or clear) the RSVP speed-reading resume pointer for a book.
 * Pass null to forget it. Creates a progress row if one doesn't exist.
 */
export async function setRsvpWordIndex(
  bookId: number,
  wordIndex: number | null
): Promise<void> {
  await execute(
    `INSERT INTO reading_progress (book_id, current_page, percentage, last_opened, rsvp_word_index)
     VALUES (?, 0, 0, ?, ?)
     ON CONFLICT(book_id) DO UPDATE SET
       rsvp_word_index = excluded.rsvp_word_index,
       last_opened     = excluded.last_opened`,
    [bookId, now(), wordIndex]
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
