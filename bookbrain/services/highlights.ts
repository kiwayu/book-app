import { execute, getAll, getOne } from "@/db/database";

/* ── Types ──────────────────────────────────────── */

export interface Highlight {
  id: number;
  book_id: number;
  cfi_range: string;
  text: string;
  color: string;
  note: string | null;
  created_at: string;
}

export interface BookNote {
  id: number;
  book_id: number;
  content: string;
  page_ref: number | null;
  created_at: string;
  updated_at: string;
}

export const HIGHLIGHT_COLORS = [
  { name: "Yellow", value: "#fbbf24" },
  { name: "Blue", value: "#60a5fa" },
  { name: "Green", value: "#34d399" },
  { name: "Pink", value: "#f472b6" },
  { name: "Orange", value: "#fb923c" },
];

/* ── Highlight CRUD ─────────────────────────────── */

export async function addHighlight(
  bookId: number,
  cfiRange: string,
  text: string,
  color: string = "#fbbf24",
  note?: string
): Promise<number> {
  const result = await execute(
    `INSERT INTO highlights (book_id, cfi_range, text, color, note)
     VALUES (?, ?, ?, ?, ?)`,
    [bookId, cfiRange, text, color, note ?? null]
  );
  return result.lastInsertRowId;
}

export async function updateHighlightNote(
  id: number,
  note: string
): Promise<void> {
  await execute(`UPDATE highlights SET note = ? WHERE id = ?`, [note, id]);
}

export async function updateHighlightColor(
  id: number,
  color: string
): Promise<void> {
  await execute(`UPDATE highlights SET color = ? WHERE id = ?`, [color, id]);
}

export async function deleteHighlight(id: number): Promise<void> {
  await execute(`DELETE FROM highlights WHERE id = ?`, [id]);
}

export async function getHighlightsForBook(
  bookId: number
): Promise<Highlight[]> {
  return getAll<Highlight>(
    `SELECT * FROM highlights WHERE book_id = ? ORDER BY created_at`,
    [bookId]
  );
}

export async function getHighlightCount(bookId: number): Promise<number> {
  const row = await getOne<{ count: number }>(
    `SELECT COUNT(*) AS count FROM highlights WHERE book_id = ?`,
    [bookId]
  );
  return row?.count ?? 0;
}

/* ── Export ──────────────────────────────────────── */

export async function exportHighlightsAsMarkdown(
  bookId: number,
  bookTitle: string
): Promise<string> {
  const highlights = await getHighlightsForBook(bookId);

  const lines: string[] = [`## Highlights from ${bookTitle}`, ""];

  for (const h of highlights) {
    lines.push(`> ${h.text}`, "");
    if (h.note) {
      lines.push(`*Note: ${h.note}*`, "");
    }
    lines.push("---", "");
  }

  return lines.join("\n");
}

/* ── Note CRUD ──────────────────────────────────── */

export async function addNote(
  bookId: number,
  content: string,
  pageRef?: number
): Promise<number> {
  const result = await execute(
    `INSERT INTO book_notes (book_id, content, page_ref, created_at, updated_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
    [bookId, content, pageRef ?? null]
  );
  return result.lastInsertRowId;
}

export async function updateNote(
  id: number,
  content: string
): Promise<void> {
  await execute(
    `UPDATE book_notes SET content = ?, updated_at = datetime('now') WHERE id = ?`,
    [content, id]
  );
}

export async function deleteNote(id: number): Promise<void> {
  await execute(`DELETE FROM book_notes WHERE id = ?`, [id]);
}

export async function getNotesForBook(bookId: number): Promise<BookNote[]> {
  return getAll<BookNote>(
    `SELECT * FROM book_notes WHERE book_id = ? ORDER BY created_at DESC`,
    [bookId]
  );
}
