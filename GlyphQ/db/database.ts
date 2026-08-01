import * as SQLite from "expo-sqlite";
/* The legacy entrypoint: the modern expo-file-system API (Paths/File) has no
   documentDirectory, and SQLite databases live at a path we construct by hand.
   services/localEpub.ts uses the same surface. */
import * as FileSystem from "expo-file-system/legacy";
import { initializeDatabase } from "./schema";

const DB_NAME = "glyphq.db";
/** Pre-rebrand filename. Anyone who used the app before it became GlyphQ has
 *  their entire library, progress and history in this file. */
const LEGACY_DB_NAME = "bookbrain.db";

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<void> | null = null;

/**
 * Carry an existing database across the rename, once, before the first open.
 *
 *   SQLite/bookbrain.db      ─┐
 *   SQLite/bookbrain.db-wal   ├─▶  SQLite/glyphq.db (+ sidecars)
 *   SQLite/bookbrain.db-shm  ─┘
 *
 * Without this the app opens a brand-new empty database and the user's books,
 * reading positions, sessions, highlights and bookmarks all appear to be gone.
 *
 * The -wal and -shm sidecars must travel with the main file: expo-sqlite runs
 * in WAL mode, so committed-but-uncheckpointed writes live in -wal. Moving the
 * .db alone silently drops the most recent ones.
 */
async function migrateLegacyDatabase(): Promise<void> {
  try {
    const dir = `${FileSystem.documentDirectory}SQLite/`;
    const legacy = `${dir}${LEGACY_DB_NAME}`;
    const current = `${dir}${DB_NAME}`;

    const [legacyInfo, currentInfo] = await Promise.all([
      FileSystem.getInfoAsync(legacy),
      FileSystem.getInfoAsync(current),
    ]);
    // Nothing to carry, or a database already lives here. Never clobber.
    if (!legacyInfo.exists || currentInfo.exists) return;

    await FileSystem.moveAsync({ from: legacy, to: current });
    for (const suffix of ["-wal", "-shm"]) {
      const from = `${legacy}${suffix}`;
      if ((await FileSystem.getInfoAsync(from)).exists) {
        await FileSystem.moveAsync({ from, to: `${current}${suffix}` });
      }
    }
  } catch {
    /* A failed migration must not stop the app opening. Worst case the user
       sees an empty library and the old file is still on disk, which is
       recoverable; throwing here would be a black screen, which is not. */
  }
}

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;

  if (!initPromise) {
    initPromise = (async () => {
      await migrateLegacyDatabase();
      db = await SQLite.openDatabaseAsync(DB_NAME);
      await initializeDatabase(db);
    })();
  }

  await initPromise;
  return db!;
}

export async function execute(
  sql: string,
  params: SQLite.SQLiteBindParams = []
): Promise<SQLite.SQLiteRunResult> {
  const database = await getDatabase();
  return database.runAsync(sql, params);
}

export async function getAll<T = Record<string, unknown>>(
  sql: string,
  params: SQLite.SQLiteBindParams = []
): Promise<T[]> {
  const database = await getDatabase();
  return database.getAllAsync<T>(sql, params);
}

export async function getOne<T = Record<string, unknown>>(
  sql: string,
  params: SQLite.SQLiteBindParams = []
): Promise<T | null> {
  const database = await getDatabase();
  return database.getFirstAsync<T>(sql, params);
}

/**
 * Run `fn` inside a SQLite transaction: all `execute` calls made within
 * it commit together or roll back together if it throws.
 */
export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const database = await getDatabase();
  let result!: T;
  await database.withTransactionAsync(async () => {
    result = await fn();
  });
  return result;
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
    initPromise = null;
  }
}
