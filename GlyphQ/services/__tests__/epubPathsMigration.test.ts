/*
 * CRITICAL regression tests for the epubPaths -> book_files migration
 * (eng review D15): branch coverage, per-entry idempotency, crash-resume,
 * no-network-at-startup, done-marker semantics.
 */

import { migrateEpubPaths } from "../epubPathsMigration";

/* ── Mocks ──────────────────────────────────────────── */

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("expo-file-system/legacy", () => ({
  EncodingType: { Base64: "base64" },
  documentDirectory: "file:///docs/",
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(async () => undefined),
  copyAsync: jest.fn(async () => undefined),
  readAsStringAsync: jest.fn(),
}));
jest.mock("../contentHash", () => ({
  hashFile: jest.fn(async (uri: string) => ({ hash: `hash:${uri}`, size: 42 })),
}));

/* In-memory stand-in for the three SQL surfaces the migration touches. */
const mockState = {
  settings: new Map<string, string>(),
  books: new Set<number>(),
  bookFiles: [] as Array<Record<string, unknown>>,
};

jest.mock("@/db/database", () => ({
  execute: jest.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("INSERT INTO book_files")) {
      const [book_id, file_path, file_type, file_size, content_hash] = params as [
        number, string, string, number | null, string | null,
      ];
      mockState.bookFiles.push({ book_id, file_path, file_type, file_size, content_hash });
    } else if (sql.includes("app_settings")) {
      mockState.settings.set(params[0] as string, "1");
    }
    return { changes: 1, lastInsertRowId: mockState.bookFiles.length };
  }),
  getOne: jest.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("app_settings")) {
      const v = mockState.settings.get(params[0] as string);
      return v ? { value: v } : null;
    }
    if (sql.includes("FROM books")) {
      return mockState.books.has(params[0] as number) ? { id: params[0] } : null;
    }
    if (sql.includes("FROM book_files") && sql.includes("book_id")) {
      return mockState.bookFiles.find((r) => r.book_id === params[0]) ?? null;
    }
    return null;
  }),
  getAll: jest.fn(async () => []),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

const getInfoAsync = FileSystem.getInfoAsync as jest.Mock;
const copyAsync = FileSystem.copyAsync as jest.Mock;

async function seedMap(map: Record<string, string>) {
  await AsyncStorage.setItem("epub_paths", JSON.stringify(map));
}
async function readMap(): Promise<Record<string, string>> {
  return JSON.parse((await AsyncStorage.getItem("epub_paths")) ?? "{}");
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockState.settings.clear();
  mockState.books.clear();
  mockState.bookFiles.length = 0;
  await AsyncStorage.clear();
  getInfoAsync.mockResolvedValue({ exists: true, isDirectory: false, size: 42 });
});

/* ── Branch coverage ────────────────────────────────── */

it("branch (a): local file is copied into books/, hashed, key consumed", async () => {
  mockState.books.add(1);
  await seedMap({ "1": "file:///downloads/old.epub" });

  const res = await migrateEpubPaths();

  expect(copyAsync).toHaveBeenCalledWith({
    from: "file:///downloads/old.epub",
    to: "file:///docs/books/old.epub",
  });
  expect(mockState.bookFiles).toEqual([
    expect.objectContaining({
      book_id: 1,
      file_path: "file:///docs/books/old.epub",
      content_hash: "hash:file:///docs/books/old.epub",
      file_size: 42,
    }),
  ]);
  expect(await readMap()).toEqual({});
  expect(res).toMatchObject({ migrated: 1, failed: 0 });
  expect(mockState.settings.get("epub_paths_migrated")).toBe("1");
});

it("branch (a): a file already under books/ is not re-copied", async () => {
  mockState.books.add(1);
  await seedMap({ "1": "file:///docs/books/already.epub" });
  await migrateEpubPaths();
  expect(copyAsync).not.toHaveBeenCalled();
  expect(mockState.bookFiles[0]).toMatchObject({
    file_path: "file:///docs/books/already.epub",
  });
});

it("branch (b): remote URLs are stored as-is with NULL hash — no network call", async () => {
  mockState.books.add(2);
  await seedMap({ "2": "https://example.com/book.epub" });

  const res = await migrateEpubPaths();

  expect(mockState.bookFiles).toEqual([
    expect.objectContaining({
      book_id: 2,
      file_path: "https://example.com/book.epub",
      content_hash: null,
      file_size: null,
    }),
  ]);
  // No filesystem or download activity for remote entries:
  expect(copyAsync).not.toHaveBeenCalled();
  expect(getInfoAsync).not.toHaveBeenCalled();
  expect(res).toMatchObject({ remote: 1 });
});

it("branch (c): missing local file keeps the book with a NULL-hash row", async () => {
  mockState.books.add(3);
  getInfoAsync.mockResolvedValue({ exists: false });
  await seedMap({ "3": "file:///gone/lost.epub" });

  const res = await migrateEpubPaths();

  expect(mockState.bookFiles).toEqual([
    expect.objectContaining({
      book_id: 3,
      file_path: "file:///gone/lost.epub",
      content_hash: null,
    }),
  ]);
  expect(res).toMatchObject({ missing: 1 });
});

it("orphans: entries whose book row is gone are consumed without inserting", async () => {
  await seedMap({ "77": "file:///x.epub" });
  const res = await migrateEpubPaths();
  expect(mockState.bookFiles).toEqual([]);
  expect(await readMap()).toEqual({});
  expect(res).toMatchObject({ orphaned: 1 });
});

it("malformed keys are consumed as orphans", async () => {
  await seedMap({ abc: "file:///x.epub", "5": "" });
  const res = await migrateEpubPaths();
  expect(res).toMatchObject({ orphaned: 2 });
  expect(await readMap()).toEqual({});
});

/* ── Idempotency & crash-resume ─────────────────────── */

it("crash-resume: an entry whose row already landed is not duplicated", async () => {
  mockState.books.add(1);
  mockState.bookFiles.push({ book_id: 1, file_path: "p", file_type: "epub", file_size: null, content_hash: null });
  await seedMap({ "1": "file:///downloads/old.epub" });

  const res = await migrateEpubPaths();

  expect(mockState.bookFiles).toHaveLength(1); // no second row
  expect(await readMap()).toEqual({});
  expect(res).toMatchObject({ migrated: 1 });
});

it("a failing entry stays in the map, blocks the done-marker, and succeeds on retry", async () => {
  mockState.books.add(1);
  mockState.books.add(2);
  await seedMap({
    "1": "file:///downloads/ok.epub",
    "2": "file:///downloads/explodes.epub",
  });
  copyAsync.mockImplementation(async ({ from }: { from: string }) => {
    if (from.includes("explodes")) throw new Error("disk error");
  });

  const first = await migrateEpubPaths();
  expect(first).toMatchObject({ migrated: 1, failed: 1 });
  expect(await readMap()).toEqual({ "2": "file:///downloads/explodes.epub" });
  expect(mockState.settings.has("epub_paths_migrated")).toBe(false);

  // Next launch: the disk behaves.
  copyAsync.mockImplementation(async () => undefined);
  const second = await migrateEpubPaths();
  expect(second).toMatchObject({ migrated: 1, failed: 0, skipped: false });
  expect(await readMap()).toEqual({});
  expect(mockState.settings.get("epub_paths_migrated")).toBe("1");
});

it("exits immediately once the done-marker is set", async () => {
  mockState.settings.set("epub_paths_migrated", "1");
  await seedMap({ "1": "file:///late-arrival.epub" });

  const res = await migrateEpubPaths();

  expect(res.skipped).toBe(true);
  expect(mockState.bookFiles).toEqual([]);
  expect(await readMap()).toEqual({ "1": "file:///late-arrival.epub" }); // untouched
});

it("an empty legacy map completes and sets the marker", async () => {
  const res = await migrateEpubPaths();
  expect(res).toMatchObject({ migrated: 0, failed: 0, skipped: false });
  expect(mockState.settings.get("epub_paths_migrated")).toBe("1");
});
