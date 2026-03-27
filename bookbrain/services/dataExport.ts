import { execute, getAll, getOne } from "@/db/database";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExportData {
  version: number;
  exported_at: string;
  books: Record<string, unknown>[];
  library_entries: Record<string, unknown>[];
  reading_sessions: Record<string, unknown>[];
  reading_progress: Record<string, unknown>[];
  tags: Record<string, unknown>[];
  book_tags: Record<string, unknown>[];
  folders: Record<string, unknown>[];
  folder_books: Record<string, unknown>[];
  book_notes: Record<string, unknown>[];
  goals: Record<string, unknown>[];
}

export interface ImportResult {
  booksImported: number;
  booksSkipped: number;
  errors: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function escapeCSV(value: string): string {
  if (!value) return "";
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function parseCSVRow(row: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const ch = row[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < row.length && row[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }

  fields.push(current);
  return fields;
}

// ── Export ────────────────────────────────────────────────────────────────────

export async function exportLibraryJSON(): Promise<string> {
  const [
    books,
    library_entries,
    reading_sessions,
    reading_progress,
    tags,
    book_tags,
    folders,
    folder_books,
    book_notes,
    goals,
  ] = await Promise.all([
    getAll("SELECT * FROM books"),
    getAll("SELECT * FROM library_entries"),
    getAll("SELECT * FROM reading_sessions"),
    getAll("SELECT * FROM reading_progress"),
    getAll("SELECT * FROM tags"),
    getAll("SELECT * FROM book_tags"),
    getAll("SELECT * FROM folders"),
    getAll("SELECT * FROM folder_books"),
    getAll("SELECT * FROM book_notes"),
    getAll("SELECT * FROM goals"),
  ]);

  const data: ExportData = {
    version: 1,
    exported_at: new Date().toISOString(),
    books,
    library_entries,
    reading_sessions,
    reading_progress,
    tags,
    book_tags,
    folders,
    folder_books,
    book_notes,
    goals,
  };

  return JSON.stringify(data, null, 2);
}

export async function exportLibraryCSV(): Promise<string> {
  const rows = await getAll<Record<string, unknown>>(
    `SELECT
       b.title, b.authors, b.isbn, b.page_count,
       le.status, le.rating, le.date_added, le.started_at, le.finished_at,
       b.genres, b.series_name, b.publisher, b.published_year
     FROM books b
     LEFT JOIN library_entries le ON le.book_id = b.id`
  );

  const headers = [
    "Title",
    "Authors",
    "ISBN",
    "Pages",
    "Status",
    "Rating",
    "Date Added",
    "Date Started",
    "Date Finished",
    "Genres",
    "Series",
    "Publisher",
    "Published Year",
  ];

  const keys = [
    "title",
    "authors",
    "isbn",
    "page_count",
    "status",
    "rating",
    "date_added",
    "started_at",
    "finished_at",
    "genres",
    "series_name",
    "publisher",
    "published_year",
  ];

  const lines = [headers.join(",")];

  for (const row of rows) {
    const values = keys.map((k) => escapeCSV(String(row[k] ?? "")));
    lines.push(values.join(","));
  }

  return lines.join("\n");
}

// ── Import ───────────────────────────────────────────────────────────────────

export async function importFromJSON(
  jsonString: string
): Promise<ImportResult> {
  const result: ImportResult = { booksImported: 0, booksSkipped: 0, errors: [] };

  let data: ExportData;
  try {
    data = JSON.parse(jsonString);
  } catch {
    result.errors.push("Invalid JSON");
    return result;
  }

  if (!data.version || data.version !== 1) {
    result.errors.push("Unsupported export version");
    return result;
  }

  for (const book of data.books) {
    try {
      // Check for duplicate by google_id or title+authors
      let existing: Record<string, unknown> | null = null;

      if (book.google_id) {
        existing = await getOne(
          "SELECT id FROM books WHERE google_id = ?",
          [book.google_id as string]
        );
      }

      if (!existing && book.title) {
        existing = await getOne(
          "SELECT id FROM books WHERE title = ? AND authors = ?",
          [book.title as string, (book.authors as string) ?? ""]
        );
      }

      if (existing) {
        result.booksSkipped++;
        continue;
      }

      // Insert book
      const cols = Object.keys(book);
      const placeholders = cols.map(() => "?").join(", ");
      const values = cols.map((c) => book[c] as string | number | null);

      const inserted = await execute(
        `INSERT INTO books (${cols.join(", ")}) VALUES (${placeholders})`,
        values
      );
      const newBookId = inserted.lastInsertRowId;
      const oldBookId = book.id;

      // Import related library_entries
      for (const entry of data.library_entries.filter(
        (e) => e.book_id === oldBookId
      )) {
        const entryCopy = { ...entry, book_id: newBookId };
        delete entryCopy.id;
        const eCols = Object.keys(entryCopy);
        await execute(
          `INSERT INTO library_entries (${eCols.join(", ")}) VALUES (${eCols.map(() => "?").join(", ")})`,
          eCols.map((c) => entryCopy[c] as string | number | null)
        );
      }

      // Import related reading_sessions
      for (const session of data.reading_sessions.filter(
        (s) => s.book_id === oldBookId
      )) {
        const sessionCopy = { ...session, book_id: newBookId };
        delete sessionCopy.id;
        const sCols = Object.keys(sessionCopy);
        await execute(
          `INSERT INTO reading_sessions (${sCols.join(", ")}) VALUES (${sCols.map(() => "?").join(", ")})`,
          sCols.map((c) => sessionCopy[c] as string | number | null)
        );
      }

      // Import related reading_progress
      for (const progress of data.reading_progress.filter(
        (p) => p.book_id === oldBookId
      )) {
        const progressCopy = { ...progress, book_id: newBookId };
        delete progressCopy.id;
        const pCols = Object.keys(progressCopy);
        await execute(
          `INSERT INTO reading_progress (${pCols.join(", ")}) VALUES (${pCols.map(() => "?").join(", ")})`,
          pCols.map((c) => progressCopy[c] as string | number | null)
        );
      }

      result.booksImported++;
    } catch (err) {
      result.errors.push(
        `Failed to import "${book.title ?? "unknown"}": ${err}`
      );
    }
  }

  return result;
}

export async function parseGoodreadsCSV(
  csvString: string
): Promise<ImportResult> {
  const result: ImportResult = { booksImported: 0, booksSkipped: 0, errors: [] };

  const lines = csvString.split("\n").filter((l) => l.trim());
  if (lines.length < 2) {
    result.errors.push("CSV file is empty or has no data rows");
    return result;
  }

  const headerFields = parseCSVRow(lines[0]);
  const colIndex = (name: string) => headerFields.indexOf(name);

  const statusMap: Record<string, string> = {
    read: "finished",
    "currently-reading": "reading",
    "to-read": "want_to_read",
  };

  for (let i = 1; i < lines.length; i++) {
    try {
      const fields = parseCSVRow(lines[i]);
      const get = (name: string) => {
        const idx = colIndex(name);
        return idx >= 0 ? fields[idx]?.trim() ?? "" : "";
      };

      const title = get("Title");
      const author = get("Author");
      const isbn = get("ISBN13") || get("ISBN");
      const cleanISBN = isbn.replace(/[="]/g, "");

      if (!title) continue;

      // Check for duplicate
      let existing: Record<string, unknown> | null = null;

      if (cleanISBN) {
        existing = await getOne("SELECT id FROM books WHERE isbn = ?", [
          cleanISBN,
        ]);
      }

      if (!existing) {
        existing = await getOne(
          "SELECT id FROM books WHERE title = ? AND authors = ?",
          [title, author]
        );
      }

      if (existing) {
        result.booksSkipped++;
        continue;
      }

      const pageCount = parseInt(get("Number of Pages"), 10) || null;
      const publishedYear = parseInt(get("Year Published"), 10) || null;
      const publisher = get("Publisher");

      const inserted = await execute(
        `INSERT INTO books (title, authors, isbn, page_count, publisher, published_year)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [title, author, cleanISBN || null, pageCount, publisher || null, publishedYear]
      );

      const bookId = inserted.lastInsertRowId;

      // Map status
      const shelf = get("Exclusive Shelf");
      const status = statusMap[shelf] ?? "want_to_read";

      // Map rating
      const rawRating = parseInt(get("My Rating"), 10);
      const rating = rawRating > 0 ? rawRating : null;

      // Map dates
      const dateAdded = get("Date Added") || null;
      const dateRead = get("Date Read") || null;

      await execute(
        `INSERT INTO library_entries (book_id, status, rating, date_added, finished_at)
         VALUES (?, ?, ?, ?, ?)`,
        [bookId, status, rating, dateAdded, dateRead]
      );

      result.booksImported++;
    } catch (err) {
      result.errors.push(`Row ${i + 1}: ${err}`);
    }
  }

  return result;
}
