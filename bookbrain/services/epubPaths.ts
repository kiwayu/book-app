import { Paths, File as ExpoFile } from "expo-file-system";
import { readAsStringAsync } from "expo-file-system";

const PATHS_FILE = new ExpoFile(Paths.document, ".epub_paths.json");

type EpubPathMap = Record<string, string>; // bookId → local/remote URI

async function readMap(): Promise<EpubPathMap> {
  try {
    const raw = await PATHS_FILE.text();
    return JSON.parse(raw) as EpubPathMap;
  } catch {
    return {};
  }
}

async function writeMap(map: EpubPathMap): Promise<void> {
  PATHS_FILE.write(JSON.stringify(map));
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
