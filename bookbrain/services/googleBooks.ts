const GOOGLE_URL = "https://www.googleapis.com/books/v1/volumes";
const OPENLIBRARY_URL = "https://openlibrary.org/search.json";
const MAX_RESULTS = 20;

export interface GoogleBook {
  id: string;
  title: string;
  authors: string[];
  pageCount: number | null;
  cover: string | null;
  publishedYear: number | null;
}

/* ── Google Books ─────────────────────────────────── */

interface VolumeInfo {
  title?: string;
  authors?: string[];
  pageCount?: number;
  imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  publishedDate?: string;
}

interface VolumeItem {
  id: string;
  volumeInfo?: VolumeInfo;
}

interface GoogleResponse {
  totalItems?: number;
  items?: VolumeItem[];
}

function parseCover(imageLinks?: VolumeInfo["imageLinks"]): string | null {
  const url = imageLinks?.thumbnail ?? imageLinks?.smallThumbnail ?? null;
  return url?.replace("http://", "https://") ?? null;
}

function parseYear(date?: string): number | null {
  if (!date) return null;
  const year = parseInt(date.substring(0, 4), 10);
  return Number.isNaN(year) ? null : year;
}

function toGoogleBook(item: VolumeItem): GoogleBook {
  const info = item.volumeInfo;
  return {
    id: item.id,
    title: info?.title ?? "Untitled",
    authors: info?.authors ?? [],
    pageCount: info?.pageCount ?? null,
    cover: parseCover(info?.imageLinks),
    publishedYear: parseYear(info?.publishedDate),
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
}

interface OLResponse {
  docs?: OLDoc[];
}

function olCover(coverId?: number): string | null {
  if (!coverId) return null;
  return `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`;
}

function toGoogleBookFromOL(doc: OLDoc): GoogleBook {
  return {
    id: doc.key,
    title: doc.title ?? "Untitled",
    authors: doc.author_name ?? [],
    pageCount: doc.number_of_pages_median ?? null,
    cover: olCover(doc.cover_i),
    publishedYear: doc.first_publish_year ?? null,
  };
}

async function searchOpenLibrary(query: string): Promise<GoogleBook[]> {
  const url = `${OPENLIBRARY_URL}?q=${encodeURIComponent(query)}&limit=${MAX_RESULTS}&fields=key,title,author_name,number_of_pages_median,cover_i,first_publish_year`;
  const res = await fetch(url);

  if (!res.ok) throw new Error(`Open Library API ${res.status}`);

  const data: OLResponse = await res.json();
  if (!data.docs?.length) return [];
  return data.docs.map(toGoogleBookFromOL);
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
