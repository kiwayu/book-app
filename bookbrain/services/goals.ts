import { execute, getAll, getOne } from "@/db/database";

/* ── Types ──────────────────────────────────────── */

export type GoalType =
  | "yearly_books"
  | "monthly_books"
  | "daily_pages"
  | "daily_minutes";

export interface Goal {
  id: number;
  type: GoalType;
  target: number;
  year: number;
  created_at: string;
}

export interface GoalProgress {
  goal: Goal;
  current: number;
  percentage: number; // 0-100
  remaining: number;
  onTrack: boolean; // are they ahead of schedule?
  paceMessage: string; // e.g. "3 books ahead" or "2 behind pace"
}

export interface DailyProgress {
  pagesRead: number;
  minutesRead: number;
  pageGoal: number;
  minuteGoal: number;
  pagePercentage: number;
  minutePercentage: number;
}

/* ── Helpers ─────────────────────────────────────── */

const currentYear = () => new Date().getFullYear();

const todayISO = () => new Date().toISOString().slice(0, 10);

/* ── Goal CRUD ──────────────────────────────────── */

export async function setGoal(
  type: GoalType,
  target: number,
  year: number = currentYear()
): Promise<void> {
  await execute(
    `INSERT INTO goals (type, target, year)
     VALUES (?, ?, ?)
     ON CONFLICT(type, year) DO UPDATE SET target = excluded.target`,
    [type, target, year]
  );
}

export async function getGoal(
  type: GoalType,
  year: number = currentYear()
): Promise<Goal | null> {
  return getOne<Goal>(
    `SELECT * FROM goals WHERE type = ? AND year = ?`,
    [type, year]
  );
}

export async function getGoalsForYear(
  year: number = currentYear()
): Promise<Goal[]> {
  return getAll<Goal>(
    `SELECT * FROM goals WHERE year = ? ORDER BY type`,
    [year]
  );
}

/* ── Yearly book progress ───────────────────────── */

export async function getYearlyBookProgress(
  year: number = currentYear()
): Promise<GoalProgress | null> {
  const goal = await getGoal("yearly_books", year);
  if (!goal) return null;

  const row = await getOne<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM library_entries
     WHERE status = 'finished'
       AND finished_at IS NOT NULL
       AND SUBSTR(finished_at, 1, 4) = ?`,
    [String(year)]
  );

  const current = row?.count ?? 0;
  const month = new Date().getMonth() + 1; // 1-12
  const expected = Math.round((month / 12) * goal.target);
  const diff = current - expected;

  let paceMessage: string;
  if (diff > 0) paceMessage = `${diff} ahead of pace`;
  else if (diff < 0) paceMessage = `${Math.abs(diff)} behind pace`;
  else paceMessage = "On track";

  const remaining = Math.max(goal.target - current, 0);
  const percentage = goal.target > 0
    ? Math.min(Math.round((current / goal.target) * 100), 100)
    : 0;

  return {
    goal,
    current,
    percentage,
    remaining,
    onTrack: diff >= 0,
    paceMessage,
  };
}

/* ── Daily progress ─────────────────────────────── */

export async function getDailyProgress(
  date: string = todayISO()
): Promise<DailyProgress> {
  const year = Number(date.slice(0, 4));

  const [pagesRow, minutesRow, pageGoalRow, minuteGoalRow] = await Promise.all([
    getOne<{ total: number }>(
      `SELECT COALESCE(SUM(pages_read), 0) AS total
       FROM reading_sessions
       WHERE DATE(start_time) = ?`,
      [date]
    ),
    getOne<{ total: number }>(
      `SELECT COALESCE(
         SUM((julianday(end_time) - julianday(start_time)) * 1440), 0
       ) AS total
       FROM reading_sessions
       WHERE DATE(start_time) = ?
         AND end_time IS NOT NULL`,
      [date]
    ),
    getGoal("daily_pages", year),
    getGoal("daily_minutes", year),
  ]);

  const pagesRead = pagesRow?.total ?? 0;
  const minutesRead = Math.round(minutesRow?.total ?? 0);
  const pageGoal = pageGoalRow?.target ?? 0;
  const minuteGoal = minuteGoalRow?.target ?? 0;

  return {
    pagesRead,
    minutesRead,
    pageGoal,
    minuteGoal,
    pagePercentage: pageGoal > 0
      ? Math.min(Math.round((pagesRead / pageGoal) * 100), 100)
      : 0,
    minutePercentage: minuteGoal > 0
      ? Math.min(Math.round((minutesRead / minuteGoal) * 100), 100)
      : 0,
  };
}

/* ── Streak (goal-aware) ────────────────────────── */

export async function getStreakForGoal(): Promise<{
  current: number;
  longest: number;
}> {
  const goal = await getGoal("daily_pages");
  const threshold = goal?.target ?? 1; // fall back to "at least 1 page"

  const rows = await getAll<{ day: string; total: number }>(
    `SELECT DATE(start_time) AS day,
            COALESCE(SUM(pages_read), 0) AS total
     FROM reading_sessions
     WHERE start_time IS NOT NULL
     GROUP BY day
     HAVING total >= ?
     ORDER BY day DESC`,
    [threshold]
  );

  if (rows.length === 0) return { current: 0, longest: 0 };

  let current = 0;
  let longest = 0;
  let streak = 0;
  let prev: Date | null = null;

  for (const row of rows) {
    const d = new Date(row.day + "T00:00:00");

    if (prev === null) {
      // Check if most recent qualifying day is today or yesterday
      const diffFromToday = Math.round(
        (new Date(todayISO() + "T00:00:00").getTime() - d.getTime()) /
          86_400_000
      );
      if (diffFromToday > 1) {
        // Streak already broken — current stays 0, but keep scanning for longest
        streak = 1;
        longest = 1;
        prev = d;
        continue;
      }
      streak = 1;
    } else {
      const gap = Math.round(
        (prev.getTime() - d.getTime()) / 86_400_000
      );
      if (gap === 1) {
        streak++;
      } else {
        if (current === 0) current = streak; // lock in current on first break
        streak = 1;
      }
    }

    longest = Math.max(longest, streak);
    prev = d;
  }

  // If we never broke, current equals the full streak
  if (current === 0) current = streak;
  longest = Math.max(longest, streak);

  return { current, longest };
}
