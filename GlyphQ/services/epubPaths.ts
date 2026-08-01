import AsyncStorage from "@react-native-async-storage/async-storage";

const PATHS_KEY = "epub_paths";

type EpubPathMap = Record<string, string>; // bookId → local/remote URI

async function readMap(): Promise<EpubPathMap> {
  try {
    const raw = await AsyncStorage.getItem(PATHS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as EpubPathMap;
  } catch {
    return {};
  }
}

async function writeMap(map: EpubPathMap): Promise<void> {
  await AsyncStorage.setItem(PATHS_KEY, JSON.stringify(map));
}

export async function getEpubPath(bookId: number): Promise<string | null> {
  const map = await readMap();
  return map[String(bookId)] ?? null;
}

export async function setEpubPath(bookId: number, uri: string): Promise<void> {
  const map = await readMap();
  map[String(bookId)] = uri;
  await writeMap(map);
}

export async function removeEpubPath(bookId: number): Promise<void> {
  const map = await readMap();
  delete map[String(bookId)];
  await writeMap(map);
}
