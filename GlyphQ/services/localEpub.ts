/*
 * Spike #0 utilities: get a local epub into app storage and the reader.
 *
 *   DocumentPicker ──▶ cache copy ──▶ documentDirectory/books/<name>
 *                                          │
 *   buildReaderHtml(html string) ──▶ documentDirectory/reader/current.html
 *                                          │
 *                  WebView source={{uri}} + allowingReadAccessToURL
 *
 * Why the HTML lands in a file: on iOS, WKWebView created from an HTML
 * string (loadHTMLString) gets an about:blank-style origin and CANNOT
 * XHR file:// URLs — which is how epub.js fetches the book. Loading the
 * HTML *as a file* from the same documentDirectory tree, with
 * allowingReadAccessToURL granting that tree, is the supported path.
 * (Design doc: eng review D12 / Spike #0.)
 *
 * NOTE: positioned/partial reads elsewhere in the plan require the
 * expo-file-system/legacy import on SDK 54 — used here for consistency.
 */

import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { ebookKindOf, looksLikeZip, safeStorageName } from "./fileValidation";

const BOOKS_DIR = () => `${FileSystem.documentDirectory}books/`;
const READER_DIR = () => `${FileSystem.documentDirectory}reader/`;

export interface PickedEbook {
  uri: string;          // file:// URI inside documentDirectory/books/
  name: string;         // stored file name (unique within books/)
  originalName: string; // name as picked — use for user-facing titles
  kind: "epub" | "pdf";
  size: number | null;
}

export class ImportValidationError extends Error {}

/**
 * Open the system picker, validate the choice, and copy it into
 * documentDirectory/books/. Returns null when the user cancels.
 *
 * Picker accepts application/octet-stream because many Android providers
 * mislabel epubs (D20); real validation is the extension check.
 */
export async function pickAndStoreLocalEbook(): Promise<PickedEbook | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      "application/epub+zip",
      "application/pdf",
      "application/octet-stream",
    ],
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];

  const displayName = asset.name ?? "book";
  const kind = ebookKindOf(displayName);
  if (!kind) {
    throw new ImportValidationError(
      `"${displayName}" is not an .epub or .pdf file.`
    );
  }

  await FileSystem.makeDirectoryAsync(BOOKS_DIR(), { intermediates: true });
  const { dest, storedName } = await uniqueDest(safeStorageName(displayName));
  await FileSystem.copyAsync({ from: asset.uri, to: dest });

  if (kind === "epub") {
    // Every epub is a zip; catch corrupt/zero-byte/mislabeled files here
    // instead of failing later inside the reader WebView.
    const head = await FileSystem.readAsStringAsync(dest, {
      encoding: FileSystem.EncodingType.Base64,
      position: 0,
      length: 4,
    }).catch(() => "");
    if (!looksLikeZip(head)) {
      await removeStoredEbook(dest);
      throw new ImportValidationError(
        `"${displayName}" doesn't look like a valid EPUB file.`
      );
    }
  }

  const info = await FileSystem.getInfoAsync(dest);
  return {
    uri: dest,
    name: storedName,
    originalName: displayName,
    kind,
    size: info.exists && "size" in info ? (info.size ?? null) : null,
  };
}

/**
 * First non-existing path in books/ for this name: "b.epub", "b-1.epub",
 * "b-2.epub"… Different books often share a file name ("book.epub");
 * overwriting would silently corrupt the earlier book's file.
 */
async function uniqueDest(
  name: string
): Promise<{ dest: string; storedName: string }> {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let storedName = name;
  // ponytail: O(n) existence probes; fine until a library has thousands
  // of identically named files.
  for (let n = 1; ; n++) {
    const info = await FileSystem.getInfoAsync(`${BOOKS_DIR()}${storedName}`);
    if (!info.exists) break;
    storedName = `${stem}-${n}${ext}`;
  }
  return { dest: `${BOOKS_DIR()}${storedName}`, storedName };
}

/** Best-effort delete of a stored ebook copy; never throws. */
export async function removeStoredEbook(uri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // cleanup only — an undeletable stray file must not break the flow
  }
}

/**
 * Persist reader HTML to a file inside documentDirectory so the WebView
 * can load it by URI (file origin) instead of as an HTML string.
 */
export async function writeReaderHtmlFile(
  html: string,
  name = "current.html"
): Promise<string> {
  await FileSystem.makeDirectoryAsync(READER_DIR(), { intermediates: true });
  const dest = `${READER_DIR()}${name}`;
  await FileSystem.writeAsStringAsync(dest, html);
  return dest;
}

/** Root the WebView is allowed to read on iOS (books/ and reader/ live under it). */
export function readAccessRoot(): string | undefined {
  return FileSystem.documentDirectory ?? undefined;
}
