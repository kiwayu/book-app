/*
 * Pure validation helpers for ebook file imports.
 *
 * Android document providers frequently report epubs as
 * application/octet-stream, so MIME alone cannot be trusted —
 * the picker accepts octet-stream and we validate by extension here.
 * (Design doc: eng review D20.)
 */

export type EbookKind = "epub" | "pdf";

const EXT_TO_KIND: Record<string, EbookKind> = {
  ".epub": "epub",
  ".pdf": "pdf",
};

/** Lower-cased extension including the dot, or "" when none. */
export function fileExtension(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const idx = base.lastIndexOf(".");
  if (idx <= 0) return ""; // no dot, or dotfile like ".epub" with no stem
  return base.slice(idx).toLowerCase();
}

/** Classify a picked file by extension; null when not an accepted ebook. */
export function ebookKindOf(name: string): EbookKind | null {
  return EXT_TO_KIND[fileExtension(name)] ?? null;
}

/**
 * True when the base64 of a file's first bytes starts with a ZIP local
 * header ("PK.."). Every valid epub is a zip; "" (zero-byte file) fails.
 */
export function looksLikeZip(headBase64: string): boolean {
  // "PK" + any third byte encodes to base64 starting with "UEs"
  return headBase64.startsWith("UEs");
}

/** Sanitize a file name for storage under documentDirectory/books/. */
export function safeStorageName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "book";
  // Replace characters that are illegal on common filesystems, plus
  // whitespace (spaces in file:// URIs would otherwise need encoding).
  const cleaned = base.replace(/[<>:"|?*]/g, "_").replace(/\s+/g, "_").trim();
  return cleaned.length > 0 ? cleaned : "book";
}
