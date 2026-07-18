/*
 * pickAndStoreLocalEbook hardening: unique storage names (no silent
 * overwrite between different books that share a file name), zip-header
 * validation for epubs, and best-effort cleanup via removeStoredEbook.
 */
import {
  pickAndStoreLocalEbook,
  removeStoredEbook,
  ImportValidationError,
} from "../localEpub";

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn(),
}));
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  EncodingType: { Base64: "base64" },
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  copyAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";

const getDocumentAsync = DocumentPicker.getDocumentAsync as jest.Mock;
const getInfoAsync = FileSystem.getInfoAsync as jest.Mock;
const copyAsync = FileSystem.copyAsync as jest.Mock;
const readAsStringAsync = FileSystem.readAsStringAsync as jest.Mock;
const deleteAsync = FileSystem.deleteAsync as jest.Mock;

/** Simulated files-on-disk: paths that getInfoAsync reports as existing. */
const disk = new Set<string>();

const ZIP_HEAD = "UEsDBA=="; // base64 of "PK\x03\x04"

beforeEach(() => {
  jest.clearAllMocks();
  disk.clear();
  getInfoAsync.mockImplementation(async (path: string) => ({
    exists: disk.has(path),
    isDirectory: false,
    size: 123,
  }));
  copyAsync.mockImplementation(async ({ to }: { to: string }) => {
    disk.add(to);
  });
  deleteAsync.mockImplementation(async (path: string) => {
    disk.delete(path);
  });
  readAsStringAsync.mockResolvedValue(ZIP_HEAD);
});

function pickerReturns(name: string) {
  getDocumentAsync.mockResolvedValue({
    canceled: false,
    assets: [{ uri: `file:///cache/${name}`, name }],
  });
}

describe("pickAndStoreLocalEbook", () => {
  it("returns null when the user cancels", async () => {
    getDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
    expect(await pickAndStoreLocalEbook()).toBeNull();
    expect(copyAsync).not.toHaveBeenCalled();
  });

  it("stores a picked epub and keeps the original name for the title", async () => {
    pickerReturns("My Book.epub");
    const out = await pickAndStoreLocalEbook();
    expect(out).toEqual({
      uri: "file:///docs/books/My_Book.epub",
      name: "My_Book.epub",
      originalName: "My Book.epub",
      kind: "epub",
      size: 123,
    });
  });

  it("never overwrites an existing stored file with the same name", async () => {
    disk.add("file:///docs/books/book.epub");
    disk.add("file:///docs/books/book-1.epub");
    pickerReturns("book.epub");

    const out = await pickAndStoreLocalEbook();

    expect(out?.uri).toBe("file:///docs/books/book-2.epub");
    expect(out?.name).toBe("book-2.epub");
    // the pre-existing files were not touched
    expect(disk.has("file:///docs/books/book.epub")).toBe(true);
    expect(disk.has("file:///docs/books/book-1.epub")).toBe(true);
  });

  it("rejects a file that is not a zip (corrupt or zero-byte epub) and cleans up", async () => {
    pickerReturns("broken.epub");
    readAsStringAsync.mockResolvedValue("PGh0bWw+"); // "<html>"

    await expect(pickAndStoreLocalEbook()).rejects.toThrow(ImportValidationError);
    expect(disk.has("file:///docs/books/broken.epub")).toBe(false);
  });

  it("rejects names that are not epub/pdf before copying anything", async () => {
    pickerReturns("notes.txt");
    await expect(pickAndStoreLocalEbook()).rejects.toThrow(ImportValidationError);
    expect(copyAsync).not.toHaveBeenCalled();
  });
});

describe("removeStoredEbook", () => {
  it("deletes the file idempotently", async () => {
    disk.add("file:///docs/books/gone.epub");
    await removeStoredEbook("file:///docs/books/gone.epub");
    expect(deleteAsync).toHaveBeenCalledWith("file:///docs/books/gone.epub", {
      idempotent: true,
    });
    expect(disk.has("file:///docs/books/gone.epub")).toBe(false);
  });

  it("never throws, even when the delete fails", async () => {
    deleteAsync.mockRejectedValue(new Error("EPERM"));
    await expect(removeStoredEbook("file:///docs/books/x.epub")).resolves.toBeUndefined();
  });
});
