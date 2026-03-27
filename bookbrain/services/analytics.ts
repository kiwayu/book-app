import { getAll, getOne } from "@/db/database";

/* ── Chart-friendly return types ─────────────────── */

export interface LabeledValue {
  label: string;
  value: number;
}

export interface BookTime {
  title: string;
  hours: number;
}

export interface StreakResult {
  current: number;
  longest: number;
}

export interface ReadingSpeedResult {
  book_title: string;
  pages_per_hour: number;
  total_pages: number;
  total_hours: number;
}

export interface GenreStat {
  genre: string;
  count: number;
}

export interface MonthlyGoalProgress {
  label: string;
  finished: number;
}

/* ── Queries ─────────────────────────────────────── */

export async function booksPerYear(): Promise<LabeledValue[]> {
  return getAll<LabeledValue>(
    `SELECT SUBSTR(finished_at, 1, 4) AS label,
            COUNT(*)                   AS value
     FROM library_entries
     WHERE status = 'finished' AND finished_at IS NOT NULL
     GROUP BY label
     ORDER BY label`
  );
}

export async function pagesPerYear(): Promise<LabeledValue[]> {
  return getAll<LabeledValue>(
    `SELECT SUBSTR(le.finished_at, 1, 4) AS label,
            COALESCE(SUM(b.page_count), 0) AS value
     FROM library_entries le
     JOIN books b ON b.id = le.book_id
     WHERE le.status = 'finished' AND le.finished_at IS NOT NULL AND b.page_count IS NOT NULL
     GROUP BY label
     ORDER BY label`
  );
}

export async function averagePagesPerBook(): Promise<number> {
  const row = await getOne<{ value: number }>(
    `SELECT COALESCE(AVG(b.page_count), 0) AS value
     FROM library_entries le
     JOIN books b ON b.id = le.book_id
     WHERE le.status = 'finished' AND b.page_count IS NOT NULL`
  );
  return Math.round(row?.value ?? 0);
}

export async function readingStreak(): Promise<StreakResult> {
  const days = await getAll<{ day: string }>(
    `SELECT DISTINCT DATE(start_time) AS day
     FROM reading_sessions
     WHERE start_time IS NOT NULL
     ORDER BY day`
  );

  if (days.length === 0) return { current: 0, longest: 0 };

  let longest = 1;
  let streak = 1;

  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1].day).getTime();
    const curr = new Date(days[i].day).getTime();
    const diffDays = (curr - prev) / 86_400_000;

    if (diffDays === 1) {
      streak++;
      if (streak > longest) longest = streak;
    } else {
      streak = 1;
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lastDay = new Date(days[days.length - 1].day).getTime();
  const gapToToday = (today.getTime() - lastDay) / 86_400_000;
  const current = gapToToday <= 1 ? streak : 0;

  return { current, longest };
}

export async function dnfRatio(): Promise<{ dnf: number; finished: number; ratio: number }> {
  const row = await getOne<{ dnf: number; finished: number }>(
    `SELECT
       SUM(CASE WHEN status = 'dnf'      THEN 1 ELSE 0 END) AS dnf,
       SUM(CASE WHEN status = 'finished'  THEN 1 ELSE 0 END) AS finished
     FROM library_entries
     WHERE status IN ('dnf', 'finished')`
  );

  const dnf = row?.dnf ?? 0;
  const finished = row?.finished ?? 0;
  const total = dnf + finished;
  const ratio = total > 0 ? Math.round((dnf / total) * 1000) / 10 : 0;

  return { dnf, finished, ratio };
}

export async function pagesPerMonth(): Promise<LabeledValue[]> {
  return getAll<LabeledValue>(
    `SELECT SUBSTR(rs.start_time, 1, 7) AS label,
            COALESCE(SUM(rs.pages_read), 0) AS value
     FROM reading_sessions rs
     WHERE rs.start_time IS NOT NULL AND rs.pages_read > 0
     GROUP BY label
     ORDER BY label`
  );
}

export async function readingTimePerBook(): Promise<BookTime[]> {
  return getAll<BookTime>(
    `SELECT b.title,
            ROUND(
              SUM(
                (JULIANDAY(rs.end_time) - JULIANDAY(rs.start_time)) * 24
              ), 1
            ) AS hours
     FROM reading_sessions rs
     JOIN books b ON b.id = rs.book_id
     WHERE rs.end_time IS NOT NULL
     GROUP BY rs.book_id
     HAVING hours > 0
     ORDER BY hours DESC`
  );
}

/* ── Reading speed (pages per hour, per book) ────── */

export async function readingSpeed(): Promise<ReadingSpeedResult[]> {
  return getAll<ReadingSpeedResult>(
    `SELECT
       b.title AS book_title,
       SUM(rs.pages_read) AS total_pages,
       ROUND(SUM((JULIANDAY(rs.end_time) - JULIANDAY(rs.start_time)) * 24), 2) AS total_hours,
       ROUND(
         CAST(SUM(rs.pages_read) AS REAL) /
         NULLIF(SUM((JULIANDAY(rs.end_time) - JULIANDAY(rs.start_time)) * 24), 0),
         1
       ) AS pages_per_hour
     FROM reading_sessions rs
     JOIN books b ON b.id = rs.book_id
     WHERE rs.end_time IS NOT NULL AND rs.pages_read > 0
     GROUP BY rs.book_id
     HAVING total_hours > 0
     ORDER BY pages_per_hour DESC`
  );
}

export async function averageReadingSpeed(): Promise<number> {
  const row = await getOne<{ speed: number }>(
    `SELECT ROUND(
       CAST(SUM(rs.pages_read) AS REAL) /
       NULLIF(SUM((JULIANDAY(rs.end_time) - JULIANDAY(rs.start_time)) * 24), 0),
       1
     ) AS speed
     FROM reading_sessions rs
     WHERE rs.end_time IS NOT NULL AND rs.pages_read > 0`
  );
  return row?.speed ?? 0;
}

/* ── Genre / category analytics ──────────────────── */

export async function booksPerGenre(): Promise<GenreStat[]> {
  const rows = await getAll<{ genres: string }>(
    `SELECT b.genres
     FROM books b
     JOIN library_entries le ON le.book_id = b.id
     WHERE le.status = 'finished' AND b.genres IS NOT NULL`
  );

  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const raw of row.genres.split(",")) {
      const genre = raw.trim();
      if (genre) counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count);
}

/* ── Books finished per month (for goal tracking) ── */

export async function booksPerMonth(): Promise<MonthlyGoalProgress[]> {
  return getAll<MonthlyGoalProgress>(
    `SELECT SUBSTR(finished_at, 1, 7) AS label,
            COUNT(*) AS finished
     FROM library_entries
     WHERE status = 'finished' AND finished_at IS NOT NULL
     GROUP BY label
     ORDER BY label`
  );
}

/* ── Average days to finish a book ───────────────── */

export async function averageDaysToFinish(): Promise<number> {
  const row = await getOne<{ avg_days: number }>(
    `SELECT ROUND(AVG(
       JULIANDAY(finished_at) - JULIANDAY(started_at)
     ), 1) AS avg_days
     FROM library_entries
     WHERE status = 'finished'
       AND started_at IS NOT NULL
       AND finished_at IS NOT NULL`
  );
  return row?.avg_days ?? 0;
}

/* ── Total stats snapshot ────────────────────────── */

export interface TotalStats {
  total_books: number;
  total_pages: number;
  total_hours: number;
  avg_rating: number;
}

export async function totalStats(): Promise<TotalStats> {
  const row = await getOne<TotalStats>(
    `SELECT
       COUNT(*)                           AS total_books,
       COALESCE(SUM(b.page_count), 0)    AS total_pages,
       COALESCE(ROUND(SUM(
         (JULIANDAY(rs.end_time) - JULIANDAY(rs.start_time)) * 24
       ), 1), 0)                          AS total_hours,
       COALESCE(ROUND(AVG(le.rating), 2), 0) AS avg_rating
     FROM library_entries le
     JOIN books b ON b.id = le.book_id
     LEFT JOIN reading_sessions rs ON rs.book_id = b.id AND rs.end_time IS NOT NULL
     WHERE le.status = 'finished'`
  );
  return row ?? { total_books: 0, total_pages: 0, total_hours: 0, avg_rating: 0 };
}

/* ── Extended analytics types ──────────────────── */

export interface HeatmapDay {
  date: string;      // YYYY-MM-DD
  minutes: number;
  pages: number;
}

export interface AuthorStat {
  author: string;
  bookCount: number;
  totalPages: number;
  avgRating: number;
}

export interface SeriesProgressItem {
  series: string;
  totalInLibrary: number;
  finished: number;
  reading: number;
  percentage: number;
}

export interface GenreRating {
  genre: string;
  avgRating: number;
  count: number;
}

export interface PaceTrend {
  month: string;     // YYYY-MM
  pagesPerDay: number;
}

export interface LengthBucket {
  label: string;     // e.g. "< 200", "200-400", "400-600", "600+"
  count: number;
}

/* ── Reading heatmap ───────────────────────────── */

export async function readingHeatmap(year?: number): Promise<HeatmapDay[]> {
  const y = year ?? new Date().getFullYear();
  return getAll<HeatmapDay>(
    `SELECT DATE(start_time) AS date,
            ROUND(SUM((JULIANDAY(end_time) - JULIANDAY(start_time)) * 1440), 1) AS minutes,
            COALESCE(SUM(pages_read), 0) AS pages
     FROM reading_sessions
     WHERE start_time LIKE '${y}%'
       AND end_time IS NOT NULL
     GROUP BY DATE(start_time)
     ORDER BY date`
  );
}

/* ── Completion rate ───────────────────────────── */

export async function completionRate(): Promise<{ started: number; finished: number; rate: number }> {
  const row = await getOne<{ started: number; finished: number }>(
    `SELECT
       SUM(CASE WHEN status IN ('reading', 'finished', 'dnf') THEN 1 ELSE 0 END) AS started,
       SUM(CASE WHEN status = 'finished' THEN 1 ELSE 0 END) AS finished
     FROM library_entries
     WHERE status IN ('reading', 'finished', 'dnf')`
  );

  const started = row?.started ?? 0;
  const finished = row?.finished ?? 0;
  const rate = started > 0 ? Math.round((finished / started) * 1000) / 10 : 0;

  return { started, finished, rate };
}

/* ── Average rating by genre ───────────────────── */

export async function averageRatingByGenre(): Promise<GenreRating[]> {
  const rows = await getAll<{ genres: string; rating: number }>(
    `SELECT b.genres, le.rating
     FROM library_entries le
     JOIN books b ON b.id = le.book_id
     WHERE le.status = 'finished' AND le.rating > 0 AND b.genres IS NOT NULL`
  );

  const sums = new Map<string, { total: number; count: number }>();
  for (const row of rows) {
    for (const raw of row.genres.split(",")) {
      const genre = raw.trim();
      if (!genre) continue;
      const entry = sums.get(genre) ?? { total: 0, count: 0 };
      entry.total += row.rating;
      entry.count += 1;
      sums.set(genre, entry);
    }
  }

  return Array.from(sums.entries())
    .map(([genre, { total, count }]) => ({
      genre,
      avgRating: Math.round((total / count) * 100) / 100,
      count,
    }))
    .sort((a, b) => b.avgRating - a.avgRating);
}

/* ── Author leaderboard ────────────────────────── */

export async function authorLeaderboard(limit?: number): Promise<AuthorStat[]> {
  const cap = limit ?? 10;
  const rows = await getAll<{ authors: string; page_count: number; rating: number }>(
    `SELECT b.authors, b.page_count, le.rating
     FROM library_entries le
     JOIN books b ON b.id = le.book_id
     WHERE le.status = 'finished' AND b.authors IS NOT NULL`
  );

  const stats = new Map<string, { books: number; pages: number; ratingSum: number; ratedCount: number }>();
  for (const row of rows) {
    const author = row.authors.split(",")[0].trim();
    if (!author) continue;
    const entry = stats.get(author) ?? { books: 0, pages: 0, ratingSum: 0, ratedCount: 0 };
    entry.books += 1;
    entry.pages += row.page_count ?? 0;
    if (row.rating > 0) {
      entry.ratingSum += row.rating;
      entry.ratedCount += 1;
    }
    stats.set(author, entry);
  }

  return Array.from(stats.entries())
    .map(([author, s]) => ({
      author,
      bookCount: s.books,
      totalPages: s.pages,
      avgRating: s.ratedCount > 0 ? Math.round((s.ratingSum / s.ratedCount) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.bookCount - a.bookCount)
    .slice(0, cap);
}

/* ── Series progress ───────────────────────────── */

export async function seriesProgress(): Promise<SeriesProgressItem[]> {
  const rows = await getAll<{ series: string; status: string }>(
    `SELECT b.series, le.status
     FROM library_entries le
     JOIN books b ON b.id = le.book_id
     WHERE b.series IS NOT NULL`
  );

  const groups = new Map<string, { total: number; finished: number; reading: number }>();
  for (const row of rows) {
    const series = row.series.trim();
    if (!series) continue;
    const entry = groups.get(series) ?? { total: 0, finished: 0, reading: 0 };
    entry.total += 1;
    if (row.status === "finished") entry.finished += 1;
    if (row.status === "reading") entry.reading += 1;
    groups.set(series, entry);
  }

  return Array.from(groups.entries())
    .map(([series, g]) => ({
      series,
      totalInLibrary: g.total,
      finished: g.finished,
      reading: g.reading,
      percentage: g.total > 0 ? Math.round((g.finished / g.total) * 100) : 0,
    }))
    .sort((a, b) => a.series.localeCompare(b.series));
}

/* ── Reading pace trend ────────────────────────── */

export async function readingPaceTrend(months?: number): Promise<PaceTrend[]> {
  const cap = months ?? 12;
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - cap + 1, 1);
  const cutoffStr = cutoff.toISOString().slice(0, 7);

  const rows = await getAll<{ month: string; totalPages: number }>(
    `SELECT SUBSTR(start_time, 1, 7) AS month,
            COALESCE(SUM(pages_read), 0) AS totalPages
     FROM reading_sessions
     WHERE start_time IS NOT NULL
       AND SUBSTR(start_time, 1, 7) >= '${cutoffStr}'
       AND pages_read > 0
     GROUP BY month
     ORDER BY month`
  );

  const currentMonth = now.toISOString().slice(0, 7);

  return rows.map((row) => {
    let daysInMonth: number;
    if (row.month === currentMonth) {
      daysInMonth = now.getDate();
    } else {
      const [y, m] = row.month.split("-").map(Number);
      daysInMonth = new Date(y, m, 0).getDate();
    }
    return {
      month: row.month,
      pagesPerDay: daysInMonth > 0 ? Math.round((row.totalPages / daysInMonth) * 10) / 10 : 0,
    };
  });
}

/* ── Book length distribution ──────────────────── */

export async function bookLengthDistribution(): Promise<LengthBucket[]> {
  const rows = await getAll<{ bucket: string; count: number }>(
    `SELECT
       CASE
         WHEN b.page_count < 200 THEN '< 200'
         WHEN b.page_count < 400 THEN '200-400'
         WHEN b.page_count < 600 THEN '400-600'
         ELSE '600+'
       END AS bucket,
       COUNT(*) AS count
     FROM library_entries le
     JOIN books b ON b.id = le.book_id
     WHERE le.status = 'finished' AND b.page_count IS NOT NULL
     GROUP BY bucket`
  );

  const order = ["< 200", "200-400", "400-600", "600+"];
  const map = new Map(rows.map((r) => [r.bucket, r.count]));
  return order.map((label) => ({ label, count: map.get(label) ?? 0 }));
}

/* ── Year in review ────────────────────────────── */

export interface YearInReview {
  booksFinished: number;
  totalPages: number;
  totalHours: number;
  avgRating: number;
  avgPagesPerBook: number;
  avgDaysToFinish: number;
  topGenre: string | null;
  topAuthor: string | null;
  longestBook: { title: string; pages: number } | null;
  shortestBook: { title: string; pages: number } | null;
}

export async function yearInReview(year?: number): Promise<YearInReview> {
  const y = year ?? new Date().getFullYear();
  const prefix = `${y}`;

  /* core stats */
  const core = await getOne<{
    booksFinished: number;
    totalPages: number;
    avgRating: number;
    avgPagesPerBook: number;
    avgDaysToFinish: number;
  }>(
    `SELECT
       COUNT(*)                                                         AS booksFinished,
       COALESCE(SUM(b.page_count), 0)                                  AS totalPages,
       COALESCE(ROUND(AVG(CASE WHEN le.rating > 0 THEN le.rating END), 2), 0) AS avgRating,
       COALESCE(ROUND(AVG(b.page_count)), 0)                           AS avgPagesPerBook,
       COALESCE(ROUND(AVG(
         JULIANDAY(le.finished_at) - JULIANDAY(le.started_at)
       ), 1), 0)                                                       AS avgDaysToFinish
     FROM library_entries le
     JOIN books b ON b.id = le.book_id
     WHERE le.status = 'finished'
       AND le.finished_at LIKE '${prefix}%'
       AND b.page_count IS NOT NULL`
  );

  /* total reading hours */
  const hoursRow = await getOne<{ totalHours: number }>(
    `SELECT COALESCE(ROUND(SUM(
       (JULIANDAY(rs.end_time) - JULIANDAY(rs.start_time)) * 24
     ), 1), 0) AS totalHours
     FROM reading_sessions rs
     WHERE rs.end_time IS NOT NULL
       AND rs.start_time LIKE '${prefix}%'`
  );

  /* top genre */
  const genreRows = await getAll<{ genres: string }>(
    `SELECT b.genres
     FROM library_entries le
     JOIN books b ON b.id = le.book_id
     WHERE le.status = 'finished'
       AND le.finished_at LIKE '${prefix}%'
       AND b.genres IS NOT NULL`
  );

  const genreCounts = new Map<string, number>();
  for (const row of genreRows) {
    for (const raw of row.genres.split(",")) {
      const genre = raw.trim();
      if (genre) genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    }
  }
  let topGenre: string | null = null;
  let topGenreCount = 0;
  for (const [genre, count] of genreCounts) {
    if (count > topGenreCount) { topGenre = genre; topGenreCount = count; }
  }

  /* top author */
  const authorRows = await getAll<{ authors: string }>(
    `SELECT b.authors
     FROM library_entries le
     JOIN books b ON b.id = le.book_id
     WHERE le.status = 'finished'
       AND le.finished_at LIKE '${prefix}%'
       AND b.authors IS NOT NULL`
  );

  const authorCounts = new Map<string, number>();
  for (const row of authorRows) {
    const author = row.authors.split(",")[0].trim();
    if (author) authorCounts.set(author, (authorCounts.get(author) ?? 0) + 1);
  }
  let topAuthor: string | null = null;
  let topAuthorCount = 0;
  for (const [author, count] of authorCounts) {
    if (count > topAuthorCount) { topAuthor = author; topAuthorCount = count; }
  }

  /* longest & shortest book */
  const longest = await getOne<{ title: string; pages: number }>(
    `SELECT b.title, b.page_count AS pages
     FROM library_entries le
     JOIN books b ON b.id = le.book_id
     WHERE le.status = 'finished'
       AND le.finished_at LIKE '${prefix}%'
       AND b.page_count IS NOT NULL
     ORDER BY b.page_count DESC
     LIMIT 1`
  );

  const shortest = await getOne<{ title: string; pages: number }>(
    `SELECT b.title, b.page_count AS pages
     FROM library_entries le
     JOIN books b ON b.id = le.book_id
     WHERE le.status = 'finished'
       AND le.finished_at LIKE '${prefix}%'
       AND b.page_count IS NOT NULL
     ORDER BY b.page_count ASC
     LIMIT 1`
  );

  return {
    booksFinished: core?.booksFinished ?? 0,
    totalPages: core?.totalPages ?? 0,
    totalHours: hoursRow?.totalHours ?? 0,
    avgRating: core?.avgRating ?? 0,
    avgPagesPerBook: core?.avgPagesPerBook ?? 0,
    avgDaysToFinish: core?.avgDaysToFinish ?? 0,
    topGenre,
    topAuthor,
    longestBook: longest ?? null,
    shortestBook: shortest ?? null,
  };
}
