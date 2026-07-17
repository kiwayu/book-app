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
import { ebookKindOf, safeStorageName } from "./fileValidation";

const BOOKS_DIR = () => `${FileSystem.documentDirectory}books/`;
const READER_DIR = () => `${FileSystem.documentDirectory}reader/`;

export interface PickedEbook {
  uri: string;          // file:// URI inside documentDirectory/books/
  name: string;         // stored file name
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
  const storedName = safeStorageName(displayName);
  const dest = `${BOOKS_DIR()}${storedName}`;
  await FileSystem.copyAsync({ from: asset.uri, to: dest });

  const info = await FileSystem.getInfoAsync(dest);
  return {
    uri: dest,
    name: storedName,
    kind,
    size: info.exists && "size" in info ? (info.size ?? null) : null,
  };
}

/**
 * Persist reader HTML to a file inside documentDirectory so the WebView
 * can load it by URI (file origin) instead of as an HTML string.
 */
export async function writeReaderHtmlFile(html: string): Promise<string> {
  await FileSystem.makeDirectoryAsync(READER_DIR(), { intermediates: true });
  const dest = `${READER_DIR()}current.html`;
  await FileSystem.writeAsStringAsync(dest, html);
  return dest;
}

/** Root the WebView is allowed to read on iOS (books/ and reader/ live under it). */
export function readAccessRoot(): string | undefined {
  return FileSystem.documentDirectory ?? undefined;
}
