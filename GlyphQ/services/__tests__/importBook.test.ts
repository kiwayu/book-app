/*
 * Library "Add from device": pick a file, create the book + library entry
 * + book_files row, dedupe by content hash. resolveBookSource is what the
 * reader tab uses to find a book's file (book_files first, legacy
 * AsyncStorage epub_paths as fallback).
 */
import {
  importBookFromDevice,
  resolveBookSource,
  removeBookFileFromDisk,
} from "../importBook";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("../localEpub", () => ({
  ImportValidationError: class ImportValidationError extends Error {},
  pickAndStoreLocalEbook: jest.fn(),
  removeStoredEbook: jest.fn(),
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
  /** When set, execute() throws for any SQL containing this substring. */
  failOn: null as string | null,
};

jest.mock("@/db/database", () => ({
  withTransaction: jest.fn(async (fn: () => Promise<unknown>) => {
    const snap = {
      books: [...state.books],
      entries: [...state.entries],
      files: [...state.files],
      nextId: state.nextId,
    };
    try {
      return await fn();
    } catch (e) {
      state.books.length = 0;
      state.books.push(...snap.books);
      state.entries.length = 0;
      state.entries.push(...snap.entries);
      state.files.length = 0;
      state.files.push(...snap.files);
      state.nextId = snap.nextId;
      throw e;
    }
  }),
  execute: jest.fn(async (sql: string, params: unknown[] = []) => {
    if (state.failOn && sql.includes(state.failOn)) {
      throw new Error(`injected db failure on: ${state.failOn}`);
    }
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
import { pickAndStoreLocalEbook, removeStoredEbook } from "../localEpub";

const pick = pickAndStoreLocalEbook as jest.Mock;
const removeStored = removeStoredEbook as jest.Mock;

beforeEach(async () => {
  jest.clearAllMocks();
  state.books.length = 0;
  state.entries.length = 0;
  state.files.length = 0;
  state.nextId = 1;
  state.failOn = null;
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
      originalName: "My_Great_Book.epub",
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
      originalName: "dup.epub",
      kind: "epub",
      size: 7,
    });

    const first = await importBookFromDevice();
    const second = await importBookFromDevice();

    expect(second).toEqual({ bookId: first!.bookId, title: "dup", duplicate: true });
    expect(state.books).toHaveLength(1);
    expect(state.files).toHaveLength(1);
  });

  it("titles the book from the original file name, not the stored one", async () => {
    pick.mockResolvedValue({
      uri: "file:///docs/books/book-2.epub", // uniquified on disk
      name: "book-2.epub",
      originalName: "My Great Book.epub",
      kind: "epub",
      size: 7,
    });
    const res = await importBookFromDevice();
    expect(res?.title).toBe("My Great Book");
  });

  it("removes the freshly stored copy when the import is a duplicate", async () => {
    // hashFile mock hashes by uri, so the same uri twice = same content
    pick.mockResolvedValue({
      uri: "file:///docs/books/dup.epub",
      name: "dup.epub",
      originalName: "dup.epub",
      kind: "epub",
      size: 7,
    });
    await importBookFromDevice(); // imported
    removeStored.mockClear();
    const second = await importBookFromDevice(); // duplicate

    expect(second?.duplicate).toBe(true);
    expect(removeStored).toHaveBeenCalledWith("file:///docs/books/dup.epub");
  });

  it("rejects PDFs for now with a validation error and cleans up the copy", async () => {
    pick.mockResolvedValue({
      uri: "file:///docs/books/paper.pdf",
      name: "paper.pdf",
      originalName: "paper.pdf",
      kind: "pdf",
      size: 7,
    });
    await expect(importBookFromDevice()).rejects.toThrow(/PDF/);
    expect(state.books).toHaveLength(0);
    expect(removeStored).toHaveBeenCalledWith("file:///docs/books/paper.pdf");
  });

  it("rolls back all rows and removes the copy when a DB insert fails", async () => {
    state.failOn = "INSERT INTO book_files";
    pick.mockResolvedValue({
      uri: "file:///docs/books/crash.epub",
      name: "crash.epub",
      originalName: "crash.epub",
      kind: "epub",
      size: 7,
    });

    await expect(importBookFromDevice()).rejects.toThrow(/injected db failure/);

    expect(state.books).toHaveLength(0); // no ghost book
    expect(state.entries).toHaveLength(0);
    expect(state.files).toHaveLength(0);
    expect(removeStored).toHaveBeenCalledWith("file:///docs/books/crash.epub");
  });
});

describe("removeBookFileFromDisk", () => {
  it("deletes the stored local file for a book", async () => {
    state.files.push({
      book_id: 3,
      file_path: "file:///docs/books/b.epub",
      content_hash: null,
    });
    await removeBookFileFromDisk(3);
    expect(removeStored).toHaveBeenCalledWith("file:///docs/books/b.epub");
  });

  it("leaves remote files alone", async () => {
    state.files.push({
      book_id: 4,
      file_path: "https://example.com/b.epub",
      content_hash: null,
    });
    await removeBookFileFromDisk(4);
    expect(removeStored).not.toHaveBeenCalled();
  });

  it("is a no-op for a book with no file row", async () => {
    await expect(removeBookFileFromDisk(99)).resolves.toBeUndefined();
    expect(removeStored).not.toHaveBeenCalled();
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
