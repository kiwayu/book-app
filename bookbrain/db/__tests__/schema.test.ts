/*
 * CRITICAL regression tests (eng review T3): the schema DDL runs against
 * a real SQLite (better-sqlite3) through a shim, proving fresh installs
 * AND upgrades from the pre-book_files schema leave data intact.
 */

import Database from "better-sqlite3";
import { initializeDatabase } from "../schema";
import type { SQLiteDatabase } from "expo-sqlite";

type Sqlite = InstanceType<typeof Database>;

function shim(db: Sqlite): SQLiteDatabase {
  return {
    execAsync: async (sql: string) => {
      db.exec(sql);
    },
  } as unknown as SQLiteDatabase;
}

function tableNames(db: Sqlite): string[] {
  return db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
    .all()
    .map((r) => (r as { name: string }).name);
}

function columnNames(db: Sqlite, table: string): string[] {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((r) => (r as { name: string }).name);
}

describe("initializeDatabase — fresh install", () => {
  let db: Sqlite;

  beforeEach(async () => {
    db = new Database(":memory:");
    await initializeDatabase(shim(db));
  });
  afterEach(() => db.close());

  it("creates the new tables", () => {
    expect(tableNames(db)).toContain("book_files");
  });

  it("adds rsvp_word_index to reading_progress via migration", () => {
    expect(columnNames(db, "reading_progress")).toContain("rsvp_word_index");
  });

  /* runMigrations swallows every DDL error so re-running is safe, which also
     means a typo'd ALTER fails silently forever. Assert the columns exist. */
  it("adds the speed-reading telemetry columns to reading_sessions", () => {
    const cols = columnNames(db, "reading_sessions");
    expect(cols).toEqual(
      expect.arrayContaining(["words_read", "mode", "wpm_last"])
    );
  });

  it("defaults existing sessions to page mode, not rsvp", () => {
    db.exec(
      `INSERT INTO books (id, title) VALUES (1, 'B');
       INSERT INTO reading_sessions (book_id, start_time) VALUES (1, '2026-07-31T09:00:00.000Z')`
    );
    const row = db
      .prepare("SELECT mode, words_read, wpm_last FROM reading_sessions")
      .get() as { mode: string; words_read: number; wpm_last: number | null };
    expect(row).toEqual({ mode: "page", words_read: 0, wpm_last: null });
  });

  it("is idempotent — running init twice changes nothing", async () => {
    await expect(initializeDatabase(shim(db))).resolves.toBeUndefined();
  });

  it("book_files enforces the file_type CHECK", () => {
    db.exec(`INSERT INTO books (id, title) VALUES (1, 'b')`);
    expect(() =>
      db
        .prepare(
          `INSERT INTO book_files (book_id, file_path, file_type) VALUES (1, 'p', 'mobi')`
        )
        .run()
    ).toThrow();
  });

  it("book_files content_hash is UNIQUE but permits multiple NULLs", () => {
    db.exec(`INSERT INTO books (id, title) VALUES (1, 'a'), (2, 'b'), (3, 'c')`);
    const ins = db.prepare(
      `INSERT INTO book_files (book_id, file_path, file_type, content_hash) VALUES (?, ?, 'epub', ?)`
    );
    ins.run(1, "p1", "HASH");
    expect(() => ins.run(2, "p2", "HASH")).toThrow(); // dup hash
    ins.run(2, "p2", null);
    ins.run(3, "p3", null); // multiple NULLs OK
  });

  it("deleting a book cascades to its file row", () => {
    db.exec(`PRAGMA foreign_keys = ON`);
    db.exec(`INSERT INTO books (id, title) VALUES (9, 'x')`);
    db.exec(
      `INSERT INTO book_files (book_id, file_path, file_type) VALUES (9, 'p', 'epub')`
    );
    db.exec(`DELETE FROM books WHERE id = 9`);
    expect(db.prepare(`SELECT count(*) c FROM book_files`).get()).toEqual({ c: 0 });
  });
});

describe("initializeDatabase — upgrade from pre-T3 schema (CRITICAL regression)", () => {
  it("preserves existing reading data while adding the new column and tables", async () => {
    const db = new Database(":memory:");
    // Simulate the live pre-upgrade database: the original books table
    // (before the description/publisher/... ALTERs), reading_progress
    // WITHOUT rsvp_word_index, no book_files.
    db.exec(`
      CREATE TABLE books (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        google_id      TEXT UNIQUE,
        title          TEXT NOT NULL,
        authors        TEXT,
        page_count     INTEGER,
        cover_url      TEXT,
        published_year INTEGER
      );
      CREATE TABLE reading_progress (
        book_id      INTEGER PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
        current_page INTEGER NOT NULL DEFAULT 0,
        percentage   REAL    NOT NULL DEFAULT 0,
        last_opened  TEXT    NOT NULL,
        cfi          TEXT
      );
      INSERT INTO books (id, title) VALUES (1, 'Existing Book');
      INSERT INTO reading_progress (book_id, current_page, percentage, last_opened, cfi)
        VALUES (1, 42, 61.5, '2026-06-01', 'epubcfi(/6/4!/4/2)');
    `);

    await initializeDatabase(shim(db));

    const row = db
      .prepare(`SELECT * FROM reading_progress WHERE book_id = 1`)
      .get() as Record<string, unknown>;
    expect(row.current_page).toBe(42);
    expect(row.percentage).toBe(61.5);
    expect(row.cfi).toBe("epubcfi(/6/4!/4/2)");
    expect(row.rsvp_word_index).toBeNull(); // new column, default NULL

    expect(tableNames(db)).toContain("book_files");
    db.close();
  });
});
