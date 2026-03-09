import { create } from "zustand";
import { execute, getAll, getOne } from "@/db/database";
import type { GoogleBook } from "@/services/googleBooks";

export type BookStatus = "want_to_read" | "reading" | "finished" | "dnf";

export interface Book {
  id: number;
  google_id: string | null;
  title: string;
  authors: string | null;
  page_count: number | null;
  cover_url: string | null;
  published_year: number | null;
}

export interface LibraryEntry {
  id: number;
  book_id: number;
  status: BookStatus;
  started_at: string | null;
  finished_at: string | null;
  rating: number | null;
}

export interface BookWithEntry extends Book {
  entry: LibraryEntry;
}

export interface Folder {
  id: number;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
}

export interface FolderWithBooks extends Folder {
  bookIds: number[];
}

interface LibraryState {
  books: BookWithEntry[];
  folders: FolderWithBooks[];
  currentBook: BookWithEntry | null;
  isLoading: boolean;

  loadLibrary: () => Promise<void>;
  addBook: (googleBook: GoogleBook, status?: BookStatus) => Promise<BookWithEntry>;
  updateStatus: (bookId: number, status: BookStatus) => Promise<void>;
  startReading: (bookId: number) => Promise<void>;
  finishReading: (bookId: number, rating?: number) => Promise<void>;
  markDNF: (bookId: number) => Promise<void>;
  setCurrentBook: (book: BookWithEntry | null) => void;

  loadFolders: () => Promise<void>;
  createFolder: (name: string, color?: string) => Promise<Folder>;
  renameFolder: (folderId: number, name: string) => Promise<void>;
  deleteFolder: (folderId: number) => Promise<void>;
  addBookToFolder: (folderId: number, bookId: number) => Promise<void>;
  removeBookFromFolder: (folderId: number, bookId: number) => Promise<void>;
}

const now = () => new Date().toISOString();

async function fetchLibrary(): Promise<BookWithEntry[]> {
  const rows = await getAll<Book & LibraryEntry & { entry_id: number }>(
    `SELECT
       b.*,
       le.id AS entry_id,
       le.status,
       le.started_at,
       le.finished_at,
       le.rating
     FROM books b
     INNER JOIN library_entries le ON le.book_id = b.id
     ORDER BY le.id DESC`
  );

  return rows.map((row) => ({
    id: row.id,
    google_id: row.google_id,
    title: row.title,
    authors: row.authors,
    page_count: row.page_count,
    cover_url: row.cover_url,
    published_year: row.published_year,
    entry: {
      id: row.entry_id,
      book_id: row.id,
      status: row.status,
      started_at: row.started_at,
      finished_at: row.finished_at,
      rating: row.rating,
    },
  }));
}

async function fetchFolders(): Promise<FolderWithBooks[]> {
  const folders = await getAll<Folder>(
    "SELECT * FROM folders ORDER BY sort_order, created_at"
  );

  const folderBooks = await getAll<{ folder_id: number; book_id: number }>(
    "SELECT folder_id, book_id FROM folder_books"
  );

  const bookMap = new Map<number, number[]>();
  for (const fb of folderBooks) {
    if (!bookMap.has(fb.folder_id)) bookMap.set(fb.folder_id, []);
    bookMap.get(fb.folder_id)!.push(fb.book_id);
  }

  return folders.map((f) => ({ ...f, bookIds: bookMap.get(f.id) ?? [] }));
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  books: [],
  folders: [],
  currentBook: null,
  isLoading: false,

  loadLibrary: async () => {
    set({ isLoading: true });
    try {
      const [books, folders] = await Promise.all([fetchLibrary(), fetchFolders()]);
      set({ books, folders });
    } finally {
      set({ isLoading: false });
    }
  },

  addBook: async (googleBook, status = "want_to_read") => {
    const existing = await getOne<Book>(
      "SELECT * FROM books WHERE google_id = ?",
      [googleBook.id]
    );

    let bookId: number;

    if (existing) {
      bookId = existing.id;
    } else {
      const result = await execute(
        `INSERT INTO books (google_id, title, authors, page_count, cover_url, published_year)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          googleBook.id,
          googleBook.title,
          googleBook.authors.join(", ") || null,
          googleBook.pageCount,
          googleBook.cover,
          googleBook.publishedYear,
        ]
      );
      bookId = result.lastInsertRowId;
    }

    const existingEntry = await getOne<LibraryEntry>(
      "SELECT * FROM library_entries WHERE book_id = ?",
      [bookId]
    );

    if (!existingEntry) {
      const startedAt = status === "reading" ? now() : null;
      await execute(
        `INSERT INTO library_entries (book_id, status, started_at)
         VALUES (?, ?, ?)`,
        [bookId, status, startedAt]
      );
    }

    await get().loadLibrary();
    const added = get().books.find((b) => b.id === bookId)!;
    return added;
  },

  updateStatus: async (bookId, status) => {
    await execute(
      `UPDATE library_entries
       SET status = ?,
           started_at  = COALESCE(started_at, ?),
           finished_at = ?
       WHERE book_id = ?`,
      [
        status,
        status === "reading" || status === "finished" ? now() : null,
        status === "finished" ? now() : null,
        bookId,
      ]
    );

    await get().loadLibrary();

    const { currentBook } = get();
    if (currentBook?.id === bookId) {
      set({ currentBook: get().books.find((b) => b.id === bookId) ?? null });
    }
  },

  startReading: async (bookId) => {
    await get().updateStatus(bookId, "reading");
  },

  finishReading: async (bookId, rating) => {
    await execute(
      `UPDATE library_entries
       SET status = 'finished',
           started_at  = COALESCE(started_at, ?),
           finished_at = ?,
           rating = ?
       WHERE book_id = ?`,
      [now(), now(), rating ?? null, bookId]
    );

    await get().loadLibrary();

    const { currentBook } = get();
    if (currentBook?.id === bookId) {
      set({ currentBook: get().books.find((b) => b.id === bookId) ?? null });
    }
  },

  markDNF: async (bookId) => {
    await get().updateStatus(bookId, "dnf");
  },

  setCurrentBook: (book) => {
    set({ currentBook: book });
  },

  /* ── Folder actions ──────────────────────────────── */

  loadFolders: async () => {
    const folders = await fetchFolders();
    set({ folders });
  },

  createFolder: async (name, color = "#818cf8") => {
    const maxOrder = await getOne<{ m: number }>(
      "SELECT COALESCE(MAX(sort_order), 0) as m FROM folders"
    );
    const result = await execute(
      "INSERT INTO folders (name, color, sort_order, created_at) VALUES (?, ?, ?, ?)",
      [name.trim(), color, (maxOrder?.m ?? 0) + 1, now()]
    );
    const folder: Folder = {
      id: result.lastInsertRowId,
      name: name.trim(),
      color,
      sort_order: (maxOrder?.m ?? 0) + 1,
      created_at: now(),
    };
    await get().loadFolders();
    return folder;
  },

  renameFolder: async (folderId, name) => {
    await execute("UPDATE folders SET name = ? WHERE id = ?", [name.trim(), folderId]);
    await get().loadFolders();
  },

  deleteFolder: async (folderId) => {
    await execute("DELETE FROM folders WHERE id = ?", [folderId]);
    await get().loadFolders();
  },

  addBookToFolder: async (folderId, bookId) => {
    await execute(
      "INSERT OR IGNORE INTO folder_books (folder_id, book_id, added_at) VALUES (?, ?, ?)",
      [folderId, bookId, now()]
    );
    await get().loadFolders();
  },

  removeBookFromFolder: async (folderId, bookId) => {
    await execute(
      "DELETE FROM folder_books WHERE folder_id = ? AND book_id = ?",
      [folderId, bookId]
    );
    await get().loadFolders();
  },
}));
