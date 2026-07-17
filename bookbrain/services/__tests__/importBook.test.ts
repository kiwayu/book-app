/*
 * Library "Add from device": pick a file, create the book + library entry
 * + book_files row, dedupe by content hash. resolveBookSource is what the
 * reader tab uses to find a book's file (book_files first, legacy
 * AsyncStorage epub_paths as fallback).
 */
import { importBookFromDevice, resolveBookSource } from "../importBook";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("../localEpub", () => ({
  ImportValidationError: class ImportValidationError extends Error {},
  pickAndStoreLocalEbook: jest.fn(),
}));
jest.mock("../contentHash", () => ({
  hashFile: jest.fn(async (uri: string) => ({ hash: `hash:${uri}`, size: 7 })),
}));

/* In-memory stand-in for the three tables the import touches. */
const state = {
  books: [] as Array<{ id: number; title: string }>,
  entries: [] as Array<{ book_id: number; status: string }>,
  files: [] as Array<Record<string, unknown>>,
  nextId: 1,
};

jest.mock("@/db/database", () => ({
  execute: jest.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("INSERT INTO books")) {
      state.books.push({ id: state.nextId, title: params[0] as string });
      return { changes: 1, lastInsertRowId: state.nextId++ };
    }
    if (sql.includes("INSERT INTO library_entries")) {
      state.entries.push({ book_id: params[0] as number, status: params[1] as string });
    }
    if (sql.includes("INSERT INTO book_files")) {
      const [book_id, file_path, file_type, file_size, content_hash] = params;
      state.files.push({ book_id, file_path, file_type, file_size, content_hash });
    }
    return { changes: 1, lastInsertRowId: 0 };
  }),
  getOne: jest.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("FROM book_files") && sql.includes("content_hash")) {
      return state.files.find((f) => f.content_hash === params[0]) ?? null;
    }
    if (sql.includes("FROM book_files") && sql.includes("book_id")) {
      return state.files.find((f) => f.book_id === params[0]) ?? null;
    }
    return null;
  }),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { pickAndStoreLocalEbook } from "../localEpub";

const pick = pickAndStoreLocalEbook as jest.Mock;

beforeEach(async () => {
  jest.clearAllMocks();
  state.books.length = 0;
  state.entries.length = 0;
  state.files.length = 0;
  state.nextId = 1;
  await AsyncStorage.clear();
});

describe("importBookFromDevice", () => {
  it("returns null when the user cancels the picker", async () => {
    pick.mockResolvedValue(null);
    expect(await importBookFromDevice()).toBeNull();
    expect(state.books).toHaveLength(0);
  });

  it("creates book + want_to_read entry + book_files row from a picked epub", async () => {
    pick.mockResolvedValue({
      uri: "file:///docs/books/My_Great_Book.epub",
      name: "My_Great_Book.epub",
      kind: "epub",
      size: 7,
    });

    const res = await importBookFromDevice();

    expect(res).toEqual({ bookId: 1, title: "My Great Book", duplicate: false });
    expect(state.books).toEqual([{ id: 1, title: "My Great Book" }]);
    expect(state.entries).toEqual([{ book_id: 1, status: "want_to_read" }]);
    expect(state.files).toEqual([
      expect.objectContaining({
        book_id: 1,
        file_path: "file:///docs/books/My_Great_Book.epub",
        file_type: "epub",
        content_hash: "hash:file:///docs/books/My_Great_Book.epub",
      }),
    ]);
  });

  it("dedupes by content hash — same file twice returns the existing book", async () => {
    pick.mockResolvedValue({
      uri: "file:///docs/books/dup.epub",
      name: "dup.epub",
      kind: "epub",
      size: 7,
    });

    const first = await importBookFromDevice();
    const second = await importBookFromDevice();

    expect(second).toEqual({ bookId: first!.bookId, title: "dup", duplicate: true });
    expect(state.books).toHaveLength(1);
    expect(state.files).toHaveLength(1);
  });

  it("rejects PDFs for now with a validation error", async () => {
    pick.mockResolvedValue({
      uri: "file:///docs/books/paper.pdf",
      name: "paper.pdf",
      kind: "pdf",
      size: 7,
    });
    await expect(importBookFromDevice()).rejects.toThrow(/PDF/);
    expect(state.books).toHaveLength(0);
  });
});

describe("resolveBookSource", () => {
  it("prefers the book_files row", async () => {
    state.files.push({ book_id: 5, file_path: "file:///docs/books/b.epub", content_hash: null });
    await AsyncStorage.setItem("epub_paths", JSON.stringify({ "5": "file:///legacy.epub" }));
    expect(await resolveBookSource(5)).toBe("file:///docs/books/b.epub");
  });

  it("falls back to the legacy epub_paths map", async () => {
    await AsyncStorage.setItem("epub_paths", JSON.stringify({ "6": "https://x.com/b.epub" }));
    expect(await resolveBookSource(6)).toBe("https://x.com/b.epub");
  });

  it("returns null when neither source knows the book", async () => {
    expect(await resolveBookSource(99)).toBeNull();
  });
});
