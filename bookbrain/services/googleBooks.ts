const BASE_URL = "https://www.googleapis.com/books/v1/volumes";
const MAX_RESULTS = 20;

export interface GoogleBook {
  id: string;
  title: string;
  authors: string[];
  pageCount: number | null;
  cover: string | null;
  publishedYear: number | null;
}

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

interface SearchResponse {
  totalItems?: number;
  items?: VolumeItem[];
}

function parseCover(imageLinks?: VolumeInfo["imageLinks"]): string | null {
  const url = imageLinks?.thumbnail ?? imageLinks?.smallThumbnail ?? null;
  return url?.replace("http://", "https://") ?? null;
}

function parseYear(publishedDate?: string): number | null {
  if (!publishedDate) return null;
  const year = parseInt(publishedDate.substring(0, 4), 10);
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

export async function searchBooks(query: string): Promise<GoogleBook[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const url = `${BASE_URL}?q=${encodeURIComponent(trimmed)}&maxResults=${MAX_RESULTS}&printType=books`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Google Books API error: ${response.status}`);
  }

  const data: SearchResponse = await response.json();

  if (!data.items?.length) return [];

  return data.items.map(toGoogleBook);
}
