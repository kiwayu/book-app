import { composeHashInput, hashFile, HASH_CHUNK_BYTES } from "../contentHash";

jest.mock("expo-file-system/legacy", () => ({
  EncodingType: { Base64: "base64" },
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
}));
jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: jest.fn(),
}));

import * as FileSystem from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";

const getInfoAsync = FileSystem.getInfoAsync as jest.Mock;
const readAsStringAsync = FileSystem.readAsStringAsync as jest.Mock;
const digestStringAsync = Crypto.digestStringAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  digestStringAsync.mockImplementation(async (_alg: string, input: string) => {
    return `sha(${input.length})`;
  });
});

describe("composeHashInput", () => {
  it("joins size, head, and tail with pipes", () => {
    expect(composeHashInput(123, "AAA", "BBB")).toBe("123|AAA|BBB");
    expect(composeHashInput(0, "", "")).toBe("0||");
  });
});

describe("hashFile", () => {
  it("returns null for a missing file", async () => {
    getInfoAsync.mockResolvedValue({ exists: false });
    expect(await hashFile("file:///nope.epub")).toBeNull();
    expect(readAsStringAsync).not.toHaveBeenCalled();
  });

  it("returns null for a directory", async () => {
    getInfoAsync.mockResolvedValue({ exists: true, isDirectory: true });
    expect(await hashFile("file:///dir/")).toBeNull();
  });

  it("small files: head covers everything, no tail read", async () => {
    const size = 1000;
    getInfoAsync.mockResolvedValue({ exists: true, isDirectory: false, size });
    readAsStringAsync.mockResolvedValue("HEAD64");

    const out = await hashFile("file:///small.epub");

    expect(readAsStringAsync).toHaveBeenCalledTimes(1);
    expect(readAsStringAsync).toHaveBeenCalledWith("file:///small.epub", {
      encoding: "base64",
      position: 0,
      length: size,
    });
    expect(digestStringAsync).toHaveBeenCalledWith(
      "SHA-256",
      composeHashInput(size, "HEAD64", "")
    );
    expect(out).toEqual({ hash: expect.stringMatching(/^sha\(/), size });
  });

  it("mid-size files (1MB < size < 2MB): tail starts at 1MB, never overlapping the head", async () => {
    const size = HASH_CHUNK_BYTES + 500_000;
    getInfoAsync.mockResolvedValue({ exists: true, isDirectory: false, size });
    readAsStringAsync.mockResolvedValueOnce("HEAD").mockResolvedValueOnce("TAIL");

    await hashFile("file:///mid.epub");

    expect(readAsStringAsync).toHaveBeenNthCalledWith(1, "file:///mid.epub", {
      encoding: "base64",
      position: 0,
      length: HASH_CHUNK_BYTES,
    });
    expect(readAsStringAsync).toHaveBeenNthCalledWith(2, "file:///mid.epub", {
      encoding: "base64",
      position: HASH_CHUNK_BYTES, // not size - 1MB, which would overlap
      length: 500_000,
    });
  });

  it("large files: reads exactly first and last 1MB", async () => {
    const size = 60 * HASH_CHUNK_BYTES; // the 60MB scanned PDF case
    getInfoAsync.mockResolvedValue({ exists: true, isDirectory: false, size });
    readAsStringAsync.mockResolvedValueOnce("HEAD").mockResolvedValueOnce("TAIL");

    await hashFile("file:///big.pdf");

    expect(readAsStringAsync).toHaveBeenNthCalledWith(2, "file:///big.pdf", {
      encoding: "base64",
      position: size - HASH_CHUNK_BYTES,
      length: HASH_CHUNK_BYTES,
    });
    expect(digestStringAsync).toHaveBeenCalledWith(
      "SHA-256",
      composeHashInput(size, "HEAD", "TAIL")
    );
  });

  it("identical inputs produce identical hashes; different sizes differ", async () => {
    digestStringAsync.mockImplementation(async (_a: string, s: string) => `sha:${s}`);
    getInfoAsync.mockResolvedValue({ exists: true, isDirectory: false, size: 10 });
    readAsStringAsync.mockResolvedValue("X");
    const a = await hashFile("file:///a");
    const b = await hashFile("file:///b");
    expect(a!.hash).toBe(b!.hash);

    getInfoAsync.mockResolvedValue({ exists: true, isDirectory: false, size: 11 });
    const c = await hashFile("file:///c");
    expect(c!.hash).not.toBe(a!.hash);
  });
});
