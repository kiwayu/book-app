import { getAll } from "@/db/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SmartCollection {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

export interface SmartCollectionWithCount extends SmartCollection {
  count: number;
}

// ---------------------------------------------------------------------------
// Predefined collections
// ---------------------------------------------------------------------------

export const SMART_COLLECTIONS: SmartCollection[] = [
  {
    id: "long_reads",
    name: "Long Reads",
    description: "Books with 500+ pages",
    icon: "book.closed.fill",
    color: "#818cf8",
  },
  {
    id: "short_reads",
    name: "Quick Reads",
    description: "Books under 200 pages",
    icon: "bolt.fill",
    color: "#fbbf24",
  },
  {
    id: "five_star",
    name: "5-Star Books",
    description: "Your highest rated books",
    icon: "star.fill",
    color: "#f59e0b",
  },
  {
    id: "unrated_finished",
    name: "Unrated",
    description: "Finished books without a rating",
    icon: "questionmark.circle.fill",
    color: "#6A89A7",
  },
  {
    id: "stale_reading",
    name: "Stale Reads",
    description: "Started 30+ days ago, not finished",
    icon: "clock.fill",
    color: "#fb923c",
  },
  {
    id: "recently_added",
    name: "Recently Added",
    description: "Added in the last 30 days",
    icon: "plus.circle.fill",
    color: "#34d399",
  },
  {
    id: "this_year",
    name: "Finished This Year",
    description: `Completed in ${new Date().getFullYear()}`,
    icon: "calendar",
    color: "#5a9dd4",
  },
  {
    id: "rereads",
    name: "Rereads",
    description: "Books you've read more than once",
    icon: "arrow.counterclockwise",
    color: "#a78bfa",
  },
];

// ---------------------------------------------------------------------------
// Query map
// ---------------------------------------------------------------------------

const QUERIES: Record<string, string> = {
  long_reads: `
    SELECT b.id FROM books b
    INNER JOIN library_entries le ON le.book_id = b.id
    WHERE b.page_count >= 500`,
  short_reads: `
    SELECT b.id FROM books b
    INNER JOIN library_entries le ON le.book_id = b.id
    WHERE b.page_count < 200 AND b.page_count > 0`,
  five_star: `
    SELECT book_id AS id FROM library_entries
    WHERE rating = 5`,
  unrated_finished: `
    SELECT book_id AS id FROM library_entries
    WHERE status = 'finished' AND (rating IS NULL OR rating = 0)`,
  stale_reading: `
    SELECT book_id AS id FROM library_entries
    WHERE status = 'reading' AND started_at < datetime('now', '-30 days')`,
  recently_added: `
    SELECT book_id AS id FROM library_entries
    WHERE date_added > datetime('now', '-30 days')`,
  this_year: `
    SELECT book_id AS id FROM library_entries
    WHERE status = 'finished' AND finished_at LIKE '${new Date().getFullYear()}%'`,
  rereads: `
    SELECT book_id AS id FROM library_entries
    WHERE reread_count > 0`,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getSmartCollectionBookIds(
  collectionId: string
): Promise<number[]> {
  const sql = QUERIES[collectionId];
  if (!sql) return [];

  const rows = await getAll<{ id: number }>(sql);
  return rows.map((r) => r.id);
}

export async function getSmartCollectionsWithCounts(): Promise<
  SmartCollectionWithCount[]
> {
  const results: SmartCollectionWithCount[] = [];

  for (const collection of SMART_COLLECTIONS) {
    const ids = await getSmartCollectionBookIds(collection.id);
    if (ids.length > 0) {
      results.push({ ...collection, count: ids.length });
    }
  }

  return results;
}

/** Alias for `getSmartCollectionBookIds` — kept for readability. */
export const getSmartCollectionBooks = getSmartCollectionBookIds;
