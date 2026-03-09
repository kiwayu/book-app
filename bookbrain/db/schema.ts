import type { SQLiteDatabase } from "expo-sqlite";

const CREATE_BOOKS = `
  CREATE TABLE IF NOT EXISTS books (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id     TEXT UNIQUE,
    title         TEXT    NOT NULL,
    authors       TEXT,
    page_count    INTEGER,
    cover_url     TEXT,
    published_year INTEGER
  );
`;

const CREATE_LIBRARY_ENTRIES = `
  CREATE TABLE IF NOT EXISTS library_entries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id     INTEGER NOT NULL UNIQUE REFERENCES books(id) ON DELETE CASCADE,
    status      TEXT    NOT NULL DEFAULT 'want_to_read'
                CHECK (status IN ('want_to_read', 'reading', 'finished', 'dnf')),
    started_at  TEXT,
    finished_at TEXT,
    rating      REAL    CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5))
  );
`;

const CREATE_READING_SESSIONS = `
  CREATE TABLE IF NOT EXISTS reading_sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    start_time  TEXT    NOT NULL,
    end_time    TEXT,
    pages_read  INTEGER NOT NULL DEFAULT 0
  );
`;

const CREATE_READING_PROGRESS = `
  CREATE TABLE IF NOT EXISTS reading_progress (
    book_id      INTEGER PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
    current_page INTEGER NOT NULL DEFAULT 0,
    percentage   REAL    NOT NULL DEFAULT 0 CHECK (percentage >= 0 AND percentage <= 100),
    last_opened  TEXT    NOT NULL,
    cfi          TEXT
  );
`;

const CREATE_FOLDERS = `
  CREATE TABLE IF NOT EXISTS folders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    color      TEXT    NOT NULL DEFAULT '#818cf8',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL
  );
`;

const CREATE_FOLDER_BOOKS = `
  CREATE TABLE IF NOT EXISTS folder_books (
    folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    book_id   INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    added_at  TEXT    NOT NULL,
    PRIMARY KEY (folder_id, book_id)
  );
`;

const CREATE_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_library_status         ON library_entries(status);
  CREATE INDEX IF NOT EXISTS idx_library_rating          ON library_entries(rating)      WHERE rating IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_library_finished_at     ON library_entries(finished_at)  WHERE finished_at IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_library_status_finished ON library_entries(status, finished_at) WHERE status = 'finished' AND finished_at IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_library_status_book     ON library_entries(status, book_id);
  CREATE INDEX IF NOT EXISTS idx_library_book_status     ON library_entries(book_id, status);

  CREATE INDEX IF NOT EXISTS idx_sessions_book           ON reading_sessions(book_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_start_time     ON reading_sessions(start_time);
  CREATE INDEX IF NOT EXISTS idx_sessions_book_time      ON reading_sessions(book_id, start_time);
  CREATE INDEX IF NOT EXISTS idx_sessions_book_end       ON reading_sessions(book_id, end_time) WHERE end_time IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_sessions_pages          ON reading_sessions(start_time, pages_read) WHERE pages_read > 0;

  CREATE INDEX IF NOT EXISTS idx_progress_last_opened    ON reading_progress(last_opened);

  CREATE INDEX IF NOT EXISTS idx_folder_books_folder     ON folder_books(folder_id);
  CREATE INDEX IF NOT EXISTS idx_folder_books_book       ON folder_books(book_id);
`;

export async function initializeDatabase(db: SQLiteDatabase) {
  await db.execAsync("PRAGMA journal_mode = WAL;");
  await db.execAsync("PRAGMA foreign_keys = ON;");

  await db.execAsync(CREATE_BOOKS);
  await db.execAsync(CREATE_LIBRARY_ENTRIES);
  await db.execAsync(CREATE_READING_SESSIONS);
  await db.execAsync(CREATE_READING_PROGRESS);
  await db.execAsync(CREATE_FOLDERS);
  await db.execAsync(CREATE_FOLDER_BOOKS);

  for (const stmt of CREATE_INDEXES.split(";").filter((s) => s.trim())) {
    await db.execAsync(stmt + ";");
  }
}
