import { execute, getAll, getOne } from "@/db/database";

/* ─── Types ─────────────────────────────────────────────────────────── */

export interface AppSettings {
  // Library
  defaultAddStatus: "want_to_read" | "reading";
  showCoversInList: boolean;
  confirmBeforeDelete: boolean;

  // Reader defaults
  readerFont: string;
  readerFontSize: number;
  readerTheme: "light" | "sepia" | "dark" | "night";
  readerLineHeight: number;
  readerMargin: number;

  // Goals
  yearlyBookGoal: number;
  dailyPageGoal: number;
  dailyReadingMinutes: number;

  // Appearance
  accentColor: string;
  compactMode: boolean;
}

/* ─── Defaults ──────────────────────────────────────────────────────── */

const DEFAULTS: AppSettings = {
  defaultAddStatus: "want_to_read",
  showCoversInList: true,
  confirmBeforeDelete: true,
  readerFont: "Georgia",
  readerFontSize: 17,
  readerTheme: "light",
  readerLineHeight: 1.6,
  readerMargin: 24,
  yearlyBookGoal: 0,
  dailyPageGoal: 0,
  dailyReadingMinutes: 0,
  accentColor: "#5a9dd4",
  compactMode: false,
};

/* ─── Helpers ───────────────────────────────────────────────────────── */

type SettingRow = { key: string; value: string };

function serialize(value: unknown): string {
  return JSON.stringify(value);
}

function deserialize<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

/* ─── Public API ────────────────────────────────────────────────────── */

/** Get a single setting with its proper type, falling back to default. */
export async function getSetting<K extends keyof AppSettings>(
  key: K
): Promise<AppSettings[K]> {
  try {
    const row = await getOne<SettingRow>(
      "SELECT value FROM app_settings WHERE key = ?",
      [key]
    );
    if (row) return deserialize<AppSettings[K]>(row.value);
  } catch {
    /* missing key or parse error — fall through to default */
  }
  return DEFAULTS[key];
}

/** Set a single setting (upsert). */
export async function setSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K]
): Promise<void> {
  await execute(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, serialize(value)]
  );
}

/** Get all settings merged with defaults. */
export async function getAllSettings(): Promise<AppSettings> {
  try {
    const rows = await getAll<SettingRow>(
      "SELECT key, value FROM app_settings"
    );

    const stored: Partial<AppSettings> = {};
    for (const row of rows) {
      if (row.key in DEFAULTS) {
        (stored as Record<string, unknown>)[row.key] = deserialize(row.value);
      }
    }

    return { ...DEFAULTS, ...stored };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Set multiple settings at once. */
export async function setMultipleSettings(
  settings: Partial<AppSettings>
): Promise<void> {
  const entries = Object.entries(settings) as [keyof AppSettings, unknown][];
  for (const [key, value] of entries) {
    await execute(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, serialize(value)]
    );
  }
}

/** Clear all settings back to defaults. */
export async function resetSettings(): Promise<void> {
  await execute("DELETE FROM app_settings");
}
