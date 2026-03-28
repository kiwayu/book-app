import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFS_KEY = "library_prefs";

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
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export async function savePrefs(prefs: Partial<LibraryPrefs>): Promise<void> {
  try {
    const current = await loadPrefs();
    const merged = { ...current, ...prefs };
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(merged));
  } catch {
    /* non-critical — silently ignore */
  }
}
