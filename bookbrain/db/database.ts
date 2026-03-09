import * as SQLite from "expo-sqlite";
import { initializeDatabase } from "./schema";

const DB_NAME = "bookbrain.db";

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<void> | null = null;

async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;

  if (!initPromise) {
    initPromise = (async () => {
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

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
    initPromise = null;
  }
}
