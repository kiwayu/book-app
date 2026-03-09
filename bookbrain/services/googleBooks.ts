const GOOGLE_URL = "https://www.googleapis.com/books/v1/volumes";
const OPENLIBRARY_URL = "https://openlibrary.org/search.json";
const MAX_RESULTS = 20;

export interface GoogleBook {
  id: string;
  title: string;
  authors: string[];
  pageCount: number | null;
  cover: string | null;
  coverLarge: string | null;
  publishedYear: number | null;
  description: string | null;
  publisher: string | null;
  categories: string[];
  isbn: string | null;
}

/* ── Google Books ─────────────────────────────────── */

interface VolumeInfo {
  title?: string;
  authors?: string[];
  pageCount?: number;
  imageLinks?: {
    thumbnail?: string;
    smallThumbnail?: string;
    small?: string;
    medium?: string;
  };
  publishedDate?: string;
  description?: string;
  publisher?: string;
  categories?: string[];
  industryIdentifiers?: { type: string; identifier: string }[];
}

interface VolumeItem {
  id: string;
  volumeInfo?: VolumeInfo;
}

interface GoogleResponse {
  totalItems?: number;
  items?: VolumeItem[];
}

function parseCover(
  imageLinks?: VolumeInfo["imageLinks"]
): { cover: string | null; coverLarge: string | null } {
  const thumb = imageLinks?.thumbnail ?? imageLinks?.smallThumbnail ?? null;
  const large = imageLinks?.medium ?? imageLinks?.small ?? thumb;
  return {
    cover: thumb?.replace("http://", "https://") ?? null,
    coverLarge: large?.replace("http://", "https://") ?? null,
  };
}

function parseYear(date?: string): number | null {
  if (!date) return null;
  const year = parseInt(date.substring(0, 4), 10);
  return Number.isNaN(year) ? null : year;
}

function parseIsbn(ids?: VolumeInfo["industryIdentifiers"]): string | null {
  if (!ids?.length) return null;
  const isbn13 = ids.find((i) => i.type === "ISBN_13");
  const isbn10 = ids.find((i) => i.type === "ISBN_10");
  return isbn13?.identifier ?? isbn10?.identifier ?? null;
}

function toGoogleBook(item: VolumeItem): GoogleBook {
  const info = item.volumeInfo;
  const covers = parseCover(info?.imageLinks);
  return {
    id: item.id,
    title: info?.title ?? "Untitled",
    authors: info?.authors ?? [],
    pageCount: info?.pageCount ?? null,
    cover: covers.cover,
    coverLarge: covers.coverLarge,
    publishedYear: parseYear(info?.publishedDate),
    description: info?.description ?? null,
    publisher: info?.publisher ?? null,
    categories: info?.categories ?? [],
    isbn: parseIsbn(info?.industryIdentifiers),
  };
}

async function searchGoogleBooks(query: string): Promise<GoogleBook[]> {
  const url = `${GOOGLE_URL}?q=${encodeURIComponent(query)}&maxResults=${MAX_RESULTS}&printType=books`;
  const res = await fetch(url);

  if (res.status === 429) throw new Error("RATE_LIMITED");
  if (!res.ok) throw new Error(`Google API ${res.status}`);

  const data: GoogleResponse = await res.json();
  if (!data.items?.length) return [];
  return data.items.map(toGoogleBook);
}

/* ── Open Library (fallback) ──────────────────────── */

interface OLDoc {
  key: string;
  title?: string;
  author_name?: string[];
  number_of_pages_median?: number;
  cover_i?: number;
  first_publish_year?: number;
  publisher?: string[];
  subject?: string[];
  isbn?: string[];
}

interface OLResponse {
  docs?: OLDoc[];
}

function olCover(coverId?: number, size: "M" | "L" = "M"): string | null {
  if (!coverId) return null;
  return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`;
}

function toGoogleBookFromOL(doc: OLDoc): GoogleBook {
  return {
    id: doc.key,
    title: doc.title ?? "Untitled",
    authors: doc.author_name ?? [],
    pageCount: doc.number_of_pages_median ?? null,
    cover: olCover(doc.cover_i, "M"),
    coverLarge: olCover(doc.cover_i, "L"),
    publishedYear: doc.first_publish_year ?? null,
    description: null,
    publisher: doc.publisher?.[0] ?? null,
    categories: doc.subject?.slice(0, 5) ?? [],
    isbn: doc.isbn?.[0] ?? null,
  };
}

async function searchOpenLibrary(query: string): Promise<GoogleBook[]> {
  if (query.length < 2) return [];

  const url = `${OPENLIBRARY_URL}?q=${encodeURIComponent(query)}&limit=${MAX_RESULTS}&fields=key,title,author_name,number_of_pages_median,cover_i,first_publish_year,publisher,subject,isbn`;
  const res = await fetch(url);

  if (!res.ok) throw new Error(`Open Library API ${res.status}`);

  const data: OLResponse = await res.json();
  if (!data.docs?.length) return [];
  return data.docs.map(toGoogleBookFromOL);
}

/* ── Book details (lazy fetch for Open Library) ───── */

interface OLWork {
  description?: string | { value: string };
}

export async function fetchBookDescription(bookId: string): Promise<string | null> {
  if (!bookId.startsWith("/works/")) return null;

  try {
    const res = await fetch(`https://openlibrary.org${bookId}.json`);
    if (!res.ok) return null;
    const data: OLWork = await res.json();
    if (!data.description) return null;
    if (typeof data.description === "string") return data.description;
    return data.description.value ?? null;
  } catch {
    return null;
  }
}

/* ── Public API ───────────────────────────────────── */

export async function searchBooks(query: string): Promise<GoogleBook[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  try {
    return await searchGoogleBooks(trimmed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "RATE_LIMITED" || msg.includes("429")) {
      console.warn("Google Books rate limited, falling back to Open Library");
      return searchOpenLibrary(trimmed);
    }
    return searchOpenLibrary(trimmed);
  }
}
