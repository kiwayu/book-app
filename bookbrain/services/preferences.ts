import * as FileSystem from "expo-file-system";

const PREFS_PATH = (FileSystem.documentDirectory ?? "") + "library_prefs.json";

export interface LibraryPrefs {
  sortKey: string;
  sortDir: string;
  activeTab: string;
  filterStatus: string[];
  filterGenres: string[];
  filterAuthors: string[];
  filterPageRange: [number, number] | null;
  filterMinRating: number | null;
  filterTagIds: number[];
}

const DEFAULTS: LibraryPrefs = {
  sortKey: "date_added",
  sortDir: "desc",
  activeTab: "all",
  filterStatus: [],
  filterGenres: [],
  filterAuthors: [],
  filterPageRange: null,
  filterMinRating: null,
  filterTagIds: [],
};

export async function loadPrefs(): Promise<LibraryPrefs> {
  try {
    const raw = await FileSystem.readAsStringAsync(PREFS_PATH);
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export async function savePrefs(prefs: Partial<LibraryPrefs>): Promise<void> {
  try {
    const current = await loadPrefs();
    const merged = { ...current, ...prefs };
    await FileSystem.writeAsStringAsync(PREFS_PATH, JSON.stringify(merged));
  } catch {
    /* non-critical — silently ignore */
  }
}
