/*
 * Fill missing book metadata (author, publisher, year) from the EPUB's own
 * metadata — extracted in the reader WebView via epub.js book.loaded.metadata.
 * Only EMPTY fields are filled, so a user's edits and Google Books data win.
 */

import { execute, getOne } from "@/db/database";

export interface EpubMeta {
  title?: string;
  creator?: string;
  publisher?: string;
  pubdate?: string;
  language?: string;
}

interface CurrentMeta {
  authors: string | null;
  publisher: string | null;
  published_year: number | null;
}

interface MetaFill {
  authors?: string;
  publisher?: string;
  published_year?: number;
}

/** Whether a book still needs author/cover extraction (empty author or cover). */
export function needsEnrichment(book: { authors: string | null; cover_url: string | null }): boolean {
  return !book.authors || !book.cover_url;
}

/** Pure: which fields should be filled from the epub metadata (empty ones only). */
export function pickMissingMeta(current: CurrentMeta, meta: EpubMeta): MetaFill {
  const out: MetaFill = {};
  const creator = meta.creator?.trim();
  const publisher = meta.publisher?.trim();
  if (!current.authors && creator) out.authors = creator;
  if (!current.publisher && publisher) out.publisher = publisher;
  if (current.published_year == null && meta.pubdate) {
    const year = parseInt(String(meta.pubdate).slice(0, 4), 10);
    if (year > 0) out.published_year = year;
  }
  return out;
}

/** Fill the book's empty metadata fields. Returns true if anything changed. */
export async function applyEpubMeta(
  bookId: number,
  meta: EpubMeta
): Promise<boolean> {
  const row = await getOne<CurrentMeta>(
    "SELECT authors, publisher, published_year FROM books WHERE id = ?",
    [bookId]
  );
  if (!row) return false;
  const fill = pickMissingMeta(row, meta);
  const keys = Object.keys(fill) as (keyof MetaFill)[];
  if (keys.length === 0) return false;
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  await execute(`UPDATE books SET ${sets} WHERE id = ?`, [
    ...keys.map((k) => fill[k] as string | number),
    bookId,
  ]);
  return true;
}
