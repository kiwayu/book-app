import { getAll, getOne } from "@/db/database";

/* ── chart-friendly return types ─────────────────── */

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

/* ── queries ─────────────────────────────────────── */

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
