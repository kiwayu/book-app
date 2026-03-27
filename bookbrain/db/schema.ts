import type { SQLiteDatabase } from "expo-sqlite";

/* ──────────────────────────────────────────────────────
   Table definitions
   ────────────────────────────────────────────────────── */

const CREATE_BOOKS = `
  CREATE TABLE IF NOT EXISTS books (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id      TEXT UNIQUE,
    title          TEXT    NOT NULL,
    authors        TEXT,
    page_count     INTEGER,
    cover_url      TEXT,
    published_year INTEGER,
    description    TEXT,
    publisher      TEXT,
    isbn           TEXT,
    series         TEXT,
    series_index   REAL,
    genres         TEXT
  );
`;

const CREATE_LIBRARY_ENTRIES = `
  CREATE TABLE IF NOT EXISTS library_entries (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id      INTEGER NOT NULL UNIQUE REFERENCES books(id) ON DELETE CASCADE,
    status       TEXT    NOT NULL DEFAULT 'want_to_read'
                 CHECK (status IN ('want_to_read', 'reading', 'finished', 'dnf')),
    date_added   TEXT    NOT NULL DEFAULT (datetime('now')),
    started_at   TEXT,
    finished_at  TEXT,
    rating       REAL    CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),
    reread_count INTEGER NOT NULL DEFAULT 0
  );
`;

const CREATE_READING_SESSIONS = `
  CREATE TABLE IF NOT EXISTS reading_sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    start_time TEXT    NOT NULL,
    end_time   TEXT,
    pages_read INTEGER NOT NULL DEFAULT 0
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

const CREATE_TAGS = `
  CREATE TABLE IF NOT EXISTS tags (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    color TEXT    NOT NULL DEFAULT '#818cf8'
  );
`;

const CREATE_BOOK_TAGS = `
  CREATE TABLE IF NOT EXISTS book_tags (
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    PRIMARY KEY (book_id, tag_id)
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
    book_id   INTEGER NOT NULL REFERENCES books(id)   ON DELETE CASCADE,
    added_at  TEXT    NOT NULL,
    PRIMARY KEY (folder_id, book_id)
  );
`;

const CREATE_APP_SETTINGS = `
  CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

const CREATE_GOALS = `
  CREATE TABLE IF NOT EXISTS goals (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT    NOT NULL CHECK (type IN ('yearly_books', 'monthly_books', 'daily_pages', 'daily_minutes')),
    target     INTEGER NOT NULL,
    year       INTEGER NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(type, year)
  );
`;

const CREATE_BOOK_NOTES = `
  CREATE TABLE IF NOT EXISTS book_notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    content    TEXT    NOT NULL,
    page_ref   INTEGER,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`;

const CREATE_HIGHLIGHTS = `
  CREATE TABLE IF NOT EXISTS highlights (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    cfi_range  TEXT    NOT NULL,
    text       TEXT    NOT NULL,
    color      TEXT    NOT NULL DEFAULT '#fbbf24',
    note       TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`;

const CREATE_BOOKMARKS = `
  CREATE TABLE IF NOT EXISTS bookmarks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    cfi         TEXT    NOT NULL,
    label       TEXT,
    page_number INTEGER,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`;

/* ──────────────────────────────────────────────────────
   Indexes — optimized for analytics & common queries
   ────────────────────────────────────────────────────── */

const CREATE_INDEXES = `
  -- library_entries: status filtering, finished-book analytics
  CREATE INDEX IF NOT EXISTS idx_library_status           ON library_entries(status);
  CREATE INDEX IF NOT EXISTS idx_library_rating           ON library_entries(rating)         WHERE rating IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_library_finished_at      ON library_entries(finished_at)    WHERE finished_at IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_library_status_finished  ON library_entries(status, finished_at) WHERE status = 'finished' AND finished_at IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_library_status_book      ON library_entries(status, book_id);
  CREATE INDEX IF NOT EXISTS idx_library_book_status      ON library_entries(book_id, status);
  CREATE INDEX IF NOT EXISTS idx_library_date_added       ON library_entries(date_added);
  CREATE INDEX IF NOT EXISTS idx_library_started_at       ON library_entries(started_at)     WHERE started_at IS NOT NULL;

  -- reading_sessions: streak, speed, time-per-book analytics
  CREATE INDEX IF NOT EXISTS idx_sessions_book            ON reading_sessions(book_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_start_time      ON reading_sessions(start_time);
  CREATE INDEX IF NOT EXISTS idx_sessions_book_time       ON reading_sessions(book_id, start_time);
  CREATE INDEX IF NOT EXISTS idx_sessions_book_end        ON reading_sessions(book_id, end_time) WHERE end_time IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_sessions_pages           ON reading_sessions(start_time, pages_read) WHERE pages_read > 0;
  CREATE INDEX IF NOT EXISTS idx_sessions_date            ON reading_sessions(start_time, end_time) WHERE end_time IS NOT NULL;

  -- reading_progress
  CREATE INDEX IF NOT EXISTS idx_progress_last_opened     ON reading_progress(last_opened);

  -- tags & book_tags
  CREATE INDEX IF NOT EXISTS idx_book_tags_book           ON book_tags(book_id);
  CREATE INDEX IF NOT EXISTS idx_book_tags_tag            ON book_tags(tag_id);

  -- folders
  CREATE INDEX IF NOT EXISTS idx_folder_books_folder      ON folder_books(folder_id);
  CREATE INDEX IF NOT EXISTS idx_folder_books_book        ON folder_books(book_id);

  -- books: series and genre filtering
  CREATE INDEX IF NOT EXISTS idx_books_series             ON books(series)         WHERE series IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_books_published_year     ON books(published_year) WHERE published_year IS NOT NULL;

  -- goals
  CREATE INDEX IF NOT EXISTS idx_goals_type_year          ON goals(type, year);

  -- book_notes
  CREATE INDEX IF NOT EXISTS idx_book_notes_book          ON book_notes(book_id);
  CREATE INDEX IF NOT EXISTS idx_book_notes_date          ON book_notes(created_at);

  -- highlights
  CREATE INDEX IF NOT EXISTS idx_highlights_book          ON highlights(book_id);

  -- bookmarks
  CREATE INDEX IF NOT EXISTS idx_bookmarks_book           ON bookmarks(book_id);
`;

/* ──────────────────────────────────────────────────────
   Migrations — safely add columns to existing tables
   ────────────────────────────────────────────────────── */

const MIGRATIONS: string[] = [
  "ALTER TABLE books ADD COLUMN description TEXT",
  "ALTER TABLE books ADD COLUMN publisher TEXT",
  "ALTER TABLE books ADD COLUMN isbn TEXT",
  "ALTER TABLE books ADD COLUMN series TEXT",
  "ALTER TABLE books ADD COLUMN series_index REAL",
  "ALTER TABLE books ADD COLUMN genres TEXT",
  "ALTER TABLE library_entries ADD COLUMN date_added TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE library_entries ADD COLUMN reread_count INTEGER NOT NULL DEFAULT 0",
];

async function runMigrations(db: SQLiteDatabase) {
  for (const sql of MIGRATIONS) {
    try {
      await db.execAsync(sql);
    } catch {
      // Column already exists — safe to ignore
    }
  }
}

/* ──────────────────────────────────────────────────────
   Initialize
   ────────────────────────────────────────────────────── */

export async function initializeDatabase(db: SQLiteDatabase) {
  await db.execAsync("PRAGMA journal_mode = WAL;");
  await db.execAsync("PRAGMA foreign_keys = ON;");

  await db.execAsync(CREATE_BOOKS);
  await db.execAsync(CREATE_LIBRARY_ENTRIES);
  await db.execAsync(CREATE_READING_SESSIONS);
  await db.execAsync(CREATE_READING_PROGRESS);
  await db.execAsync(CREATE_TAGS);
  await db.execAsync(CREATE_BOOK_TAGS);
  await db.execAsync(CREATE_FOLDERS);
  await db.execAsync(CREATE_FOLDER_BOOKS);
  await db.execAsync(CREATE_APP_SETTINGS);
  await db.execAsync(CREATE_GOALS);
  await db.execAsync(CREATE_BOOK_NOTES);
  await db.execAsync(CREATE_HIGHLIGHTS);
  await db.execAsync(CREATE_BOOKMARKS);

  await runMigrations(db);

  for (const stmt of CREATE_INDEXES.split(";").filter((s) => s.trim())) {
    await db.execAsync(stmt + ";");
  }
}
