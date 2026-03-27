import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  StyleSheet,
  Animated,
  type LayoutChangeEvent,
} from "react-native";
import { useRouter } from "expo-router";
import Swipeable from "react-native-gesture-handler/Swipeable";
import {
  useLibraryStore,
  type BookWithEntry,
  type BookStatus,
  type FolderWithBooks,
} from "@/store/libraryStore";
import { t } from "@/theme";
import { type BookCardProgress } from "@/components/ui/BookCard";
import { CoverShelf, type CoverShelfBook } from "@/components/ui/CoverShelf";
import { CompactBookRow } from "@/components/ui/CompactBookRow";
import { BookDetailSheet } from "@/components/ui/BookDetailSheet";
import { SegmentedControl, type Segment } from "@/components/ui/SegmentedControl";
import { AlphabetIndex } from "@/components/ui/AlphabetIndex";
import { SearchBar } from "@/components/ui/SearchBar";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  FilterSheet,
  type LibraryFilters,
  EMPTY_FILTERS,
  countActiveFilters,
} from "@/components/ui/FilterSheet";
import { getAll } from "@/db/database";
import { loadPrefs, savePrefs, type LibraryPrefs } from "@/services/preferences";
import {
  getSmartCollectionsWithCounts,
  getSmartCollectionBookIds,
  SMART_COLLECTIONS,
  type SmartCollectionWithCount,
} from "@/services/smartCollections";

/* ── Types & constants ─────────────────────────────── */

interface ProgressRow { book_id: number; current_page: number; percentage: number; }
type SortKey = "title" | "author" | "page_count" | "published_year" | "progress" | "rating" | "date_added";
type SortDir = "asc" | "desc";
type TabKey = "all" | BookStatus;

const SORT_OPTIONS: { key: SortKey; label: string; shortLabel: string }[] = [
  { key: "date_added", label: "Date Added", shortLabel: "Added" },
  { key: "title", label: "Title", shortLabel: "Title" },
  { key: "author", label: "Author", shortLabel: "Author" },
  { key: "page_count", label: "Page Count", shortLabel: "Pages" },
  { key: "published_year", label: "Year Published", shortLabel: "Year" },
  { key: "progress", label: "Progress", shortLabel: "Progress" },
  { key: "rating", label: "Rating", shortLabel: "Rating" },
];

const FOLDER_COLORS = [
  "#818cf8", "#f472b6", "#34d399", "#fbbf24",
  "#fb923c", "#a78bfa", "#38bdf8", "#f87171",
];

interface RecentBook {
  id: number; title: string; authors: string | null;
  cover_url: string | null; page_count: number | null;
  last_activity: string; status: string;
}

/* ── Helpers ───────────────────────────────────────── */

function firstLetter(title: string): string {
  const ch = title.charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : "#";
}

interface LetterGroup { letter: string; books: BookWithEntry[]; }

function groupByLetter(list: BookWithEntry[]): LetterGroup[] {
  const sorted = [...list].sort((a, b) => a.title.localeCompare(b.title));
  const map = new Map<string, BookWithEntry[]>();
  for (const b of sorted) {
    const l = firstLetter(b.title);
    if (!map.has(l)) map.set(l, []);
    map.get(l)!.push(b);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)))
    .map(([letter, books]) => ({ letter, books }));
}

interface SeriesGroup { name: string; books: CoverShelfBook[]; }

function filtersToPrefs(f: LibraryFilters): Partial<LibraryPrefs> {
  return {
    filterStatus: f.status, filterGenres: f.genres, filterAuthors: f.authors,
    filterPageRange: f.pageRange, filterMinRating: f.minRating, filterTagIds: f.tagIds,
  };
}

function prefsToFilters(p: LibraryPrefs): LibraryFilters {
  return {
    status: (p.filterStatus ?? []) as BookStatus[],
    genres: p.filterGenres ?? [], authors: p.filterAuthors ?? [],
    pageRange: p.filterPageRange ?? null, minRating: p.filterMinRating ?? null,
    tagIds: p.filterTagIds ?? [],
  };
}

/* ── Inline Sort Strip ────────────────────────────── */

function SortStrip({ sortKey, sortDir, onSelect, onToggleDir }: {
  sortKey: SortKey; sortDir: SortDir;
  onSelect: (key: SortKey) => void; onToggleDir: () => void;
}) {
  const arrowTranslate = useRef(new Animated.Value(0)).current;

  const handlePress = (key: SortKey) => {
    const dirWillChange = key === sortKey;
    if (dirWillChange) {
      arrowTranslate.setValue(-6);
      Animated.spring(arrowTranslate, { toValue: 0, friction: 5, tension: 120, useNativeDriver: true }).start();
      onToggleDir();
    } else {
      onSelect(key);
    }
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={srt.strip}>
      {SORT_OPTIONS.map((opt) => {
        const active = opt.key === sortKey;
        return (
          <Pressable key={opt.key}
            style={({ pressed }) => [srt.pill, active && srt.pillActive, pressed && srt.pillPressed]}
            onPress={() => handlePress(opt.key)}>
            {active && (
              <Animated.Text style={[srt.dirArrow, { transform: [{ translateY: arrowTranslate }] }]}>
                {sortDir === "asc" ? "↑" : "↓"}
              </Animated.Text>
            )}
            <Text style={[srt.pillLabel, active && srt.pillLabelActive]}>{opt.shortLabel}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* ── Collapsible Section ──────────────────────────── */

function CollapsibleSection({
  title, emoji, count, children,
  defaultExpanded = true, previewCount = -1,
  accentColor, rightAction,
}: {
  title: string; emoji: string; count: number; children: React.ReactNode;
  defaultExpanded?: boolean; previewCount?: number;
  accentColor?: string; rightAction?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showAll, setShowAll] = useState(false);
  const hasPreview = previewCount >= 0 && count > previewCount;
  const isShowingPreview = hasPreview && !showAll;

  return (
    <View style={s.section}>
      <SectionHeader
        title={title} emoji={emoji} count={count}
        chevron={expanded ? "expanded" : "collapsed"}
        accentColor={accentColor}
        onPress={() => setExpanded((v) => !v)}
        rightAction={
          <View style={s.sectionRight}>
            {expanded && hasPreview && (
              <Pressable onPress={() => setShowAll((v) => !v)} hitSlop={8}>
                <Text style={s.seeAllText}>{showAll ? "Collapse" : "See All"}</Text>
              </Pressable>
            )}
            {rightAction}
          </View>
        }
      />
      {expanded && (
        <View style={s.sectionBody}>
          {isShowingPreview
            ? (children as React.ReactElement[])?.slice?.(0, previewCount) ?? children
            : children}
        </View>
      )}
    </View>
  );
}

/* ── Empty Section ────────────────────────────────── */

function EmptySection({ onAdd }: { onAdd: () => void }) {
  return (
    <Pressable style={s.emptyCard} onPress={onAdd}>
      <View style={s.emptyCircle}><Text style={s.emptyPlus}>+</Text></View>
      <Text style={s.emptyLabel}>Add a book</Text>
    </Pressable>
  );
}

/* ── New Folder Modal ─────────────────────────────── */

function NewFolderModal({ visible, onClose, onCreate }: {
  visible: boolean; onClose: () => void; onCreate: (name: string, color: string) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(FOLDER_COLORS[0]);
  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate(name.trim(), color);
    setName(""); setColor(FOLDER_COLORS[0]); onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={modal.overlay} onPress={onClose}>
        <Pressable style={modal.card} onPress={() => {}}>
          <Text style={modal.title}>New Folder</Text>
          <TextInput style={modal.input} placeholder="Folder name…" placeholderTextColor={t.color.text.tertiary}
            value={name} onChangeText={setName} autoFocus maxLength={40} />
          <Text style={modal.colorLabel}>Color</Text>
          <View style={modal.colorRow}>
            {FOLDER_COLORS.map((c) => (
              <Pressable key={c} style={[modal.colorDot, { backgroundColor: c }, color === c && modal.colorDotActive]} onPress={() => setColor(c)} />
            ))}
          </View>
          <View style={modal.actions}>
            <Pressable style={modal.cancelBtn} onPress={onClose}><Text style={modal.cancelText}>Cancel</Text></Pressable>
            <Pressable style={[modal.createBtn, !name.trim() && { opacity: 0.4 }]} onPress={handleCreate} disabled={!name.trim()}>
              <Text style={modal.createText}>Create</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════
   Main Library Screen
   ══════════════════════════════════════════════════════ */

export default function LibraryScreen() {
  const {
    books, folders, tags, isLoading, loadLibrary,
    startReading, finishReading, markDNF, openBook,
    createFolder, deleteFolder, setCurrentBook, deleteBook,
  } = useLibraryStore();
  const router = useRouter();

  /* ── State ───────────────────────────────────────── */
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [progressMap, setProgressMap] = useState<Map<number, BookCardProgress>>(new Map());
  const [bookTagsMap, setBookTagsMap] = useState<Map<number, number[]>>(new Map());
  const [recentBooks, setRecentBooks] = useState<RecentBook[]>([]);

  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date_added");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filters, setFilters] = useState<LibraryFilters>(EMPTY_FILTERS);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const [smartCollections, setSmartCollections] = useState<SmartCollectionWithCount[]>([]);
  const [activeSmartCollection, setActiveSmartCollection] = useState<string | null>(null);
  const [smartCollectionBookIds, setSmartCollectionBookIds] = useState<number[]>([]);

  const [detailBook, setDetailBook] = useState<BookWithEntry | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const openSwipeableRef = useRef<Swipeable | null>(null);
  const letterPositions = useRef<Map<string, number>>(new Map());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Persistence ────────────────────────────────── */
  useEffect(() => {
    loadPrefs().then((p) => {
      const sk = p.sortKey as SortKey;
      if (SORT_OPTIONS.some((o) => o.key === sk)) setSortKey(sk);
      if (p.sortDir === "asc" || p.sortDir === "desc") setSortDir(p.sortDir);
      const tab = p.activeTab as TabKey;
      if (["all", "reading", "want_to_read", "finished", "dnf"].includes(tab)) setActiveTab(tab);
      setFilters(prefsToFilters(p));
      setPrefsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!prefsLoaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      savePrefs({ sortKey, sortDir, activeTab, ...filtersToPrefs(filters) });
    }, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [sortKey, sortDir, activeTab, filters, prefsLoaded]);

  /* ── Data loading ────────────────────────────────── */
  useEffect(() => {
    loadLibrary();
    getSmartCollectionsWithCounts().then(setSmartCollections);
  }, [loadLibrary]);

  useEffect(() => {
    getAll<ProgressRow>("SELECT book_id, current_page, percentage FROM reading_progress").then((rows) => {
      const map = new Map<number, BookCardProgress>();
      for (const r of rows) map.set(r.book_id, { currentPage: r.current_page, percentage: r.percentage });
      setProgressMap(map);
    });
  }, [books]);

  useEffect(() => {
    getAll<{ book_id: number; tag_id: number }>("SELECT book_id, tag_id FROM book_tags").then((rows) => {
      const map = new Map<number, number[]>();
      for (const r of rows) {
        if (!map.has(r.book_id)) map.set(r.book_id, []);
        map.get(r.book_id)!.push(r.tag_id);
      }
      setBookTagsMap(map);
    });
  }, [books]);

  useEffect(() => {
    getAll<RecentBook>(
      `SELECT b.id, b.title, b.authors, b.cover_url, b.page_count, le.status,
              MAX(COALESCE(rp.last_opened, le.finished_at, le.started_at)) AS last_activity
       FROM books b
       INNER JOIN library_entries le ON le.book_id = b.id
       LEFT JOIN reading_progress rp ON rp.book_id = b.id
       WHERE le.status IN ('reading', 'finished')
         AND COALESCE(rp.last_opened, le.finished_at, le.started_at) IS NOT NULL
       GROUP BY b.id
       ORDER BY last_activity DESC
       LIMIT 10`
    ).then(setRecentBooks);
  }, [books]);

  /* ── Derived ─────────────────────────────────────── */
  const uniqueGenres = useMemo(() => {
    const set = new Set<string>();
    for (const b of books) if (b.genres) for (const g of b.genres.split(",")) { const v = g.trim(); if (v) set.add(v); }
    return Array.from(set).sort();
  }, [books]);

  const uniqueAuthors = useMemo(() => {
    const set = new Set<string>();
    for (const b of books) if (b.authors) set.add(b.authors);
    return Array.from(set).sort();
  }, [books]);

  const isControlsActive =
    searchQuery.trim().length > 0 || sortKey !== "date_added" ||
    sortDir !== "desc" || countActiveFilters(filters) > 0;

  const activeFilterCount = countActiveFilters(filters);

  const statusCounts = useMemo(() => {
    const m: Record<BookStatus, number> = { reading: 0, want_to_read: 0, finished: 0, dnf: 0 };
    for (const b of books) m[b.entry.status]++;
    return m;
  }, [books]);

  const segments = useMemo<Segment[]>(() => [
    { key: "all", label: "All", count: books.length },
    { key: "reading", label: "Reading", count: statusCounts.reading },
    { key: "want_to_read", label: "Want", count: statusCounts.want_to_read },
    { key: "finished", label: "Done", count: statusCounts.finished },
    { key: "dnf", label: "DNF", count: statusCounts.dnf },
  ], [books.length, statusCounts]);

  const tabBooks = useMemo(() => {
    if (activeTab === "all") return books;
    return books.filter((b) => b.entry.status === activeTab);
  }, [books, activeTab]);

  const filteredSorted = useMemo(() => {
    let result = [...tabBooks];
    // If a smart collection is active, filter to those book IDs
    if (activeSmartCollection) {
      result = result.filter(b => smartCollectionBookIds.includes(b.id));
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) result = result.filter((b) => b.title.toLowerCase().includes(q) || (b.authors?.toLowerCase().includes(q) ?? false));
    if (filters.status.length > 0) result = result.filter((b) => filters.status.includes(b.entry.status));
    if (filters.genres.length > 0) result = result.filter((b) => { if (!b.genres) return false; const bg = b.genres.split(",").map((g) => g.trim()); return filters.genres.some((fg) => bg.includes(fg)); });
    if (filters.authors.length > 0) result = result.filter((b) => filters.authors.includes(b.authors ?? ""));
    if (filters.pageRange) { const [min, max] = filters.pageRange; result = result.filter((b) => b.page_count != null && b.page_count >= min && b.page_count <= max); }
    if (filters.minRating != null) { const min = filters.minRating; result = result.filter((b) => (b.entry.rating ?? 0) >= min); }
    if (filters.tagIds.length > 0) result = result.filter((b) => { const bt = bookTagsMap.get(b.id) ?? []; return filters.tagIds.some((tid) => bt.includes(tid)); });
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "title": cmp = a.title.localeCompare(b.title); break;
        case "author": cmp = (a.authors ?? "").localeCompare(b.authors ?? ""); break;
        case "page_count": cmp = (a.page_count ?? 0) - (b.page_count ?? 0); break;
        case "published_year": cmp = (a.published_year ?? 0) - (b.published_year ?? 0); break;
        case "progress": cmp = (progressMap.get(a.id)?.percentage ?? 0) - (progressMap.get(b.id)?.percentage ?? 0); break;
        case "rating": cmp = (a.entry.rating ?? 0) - (b.entry.rating ?? 0); break;
        case "date_added": cmp = (a.entry.date_added ?? "").localeCompare(b.entry.date_added ?? ""); break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return result;
  }, [tabBooks, searchQuery, filters, sortKey, sortDir, progressMap, bookTagsMap, activeSmartCollection, smartCollectionBookIds]);

  const letterGroups = useMemo(() => {
    if (activeTab === "all" || isControlsActive) return [];
    return groupByLetter(tabBooks);
  }, [activeTab, tabBooks, isControlsActive]);

  const availableLetters = useMemo(() => letterGroups.map((g) => g.letter), [letterGroups]);

  const seriesGroups = useMemo<SeriesGroup[]>(() => {
    const map = new Map<string, BookWithEntry[]>();
    for (const b of books) {
      if (b.series) {
        if (!map.has(b.series)) map.set(b.series, []);
        map.get(b.series)!.push(b);
      }
    }
    return Array.from(map.entries())
      .filter(([, list]) => list.length >= 2)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, list]) => ({
        name,
        books: list
          .sort((a, b) => (a.series_index ?? 999) - (b.series_index ?? 999))
          .map((bk) => ({ id: bk.id, title: bk.title, authors: bk.authors, cover_url: bk.cover_url, status: bk.entry.status })),
      }));
  }, [books]);

  const bookMap = useMemo(() => {
    const m = new Map<number, BookWithEntry>();
    for (const b of books) m.set(b.id, b);
    return m;
  }, [books]);

  const currentlyReading = useMemo<CoverShelfBook[]>(() =>
    books.filter((b) => b.entry.status === "reading").map((b) => ({
      id: b.id, title: b.title, authors: b.authors, cover_url: b.cover_url, status: "reading",
    })),
  [books]);

  const recentShelfBooks = useMemo<CoverShelfBook[]>(() =>
    recentBooks.map((b) => ({ id: b.id, title: b.title, authors: b.authors, cover_url: b.cover_url, status: b.status })),
  [recentBooks]);

  /* ── Handlers ────────────────────────────────────── */
  const handleRefresh = useCallback(async () => { setRefreshing(true); await loadLibrary(); setRefreshing(false); }, [loadLibrary]);
  const goToSearch = useCallback(() => router.push("/search"), [router]);

  const handleOpenReader = useCallback(async (book: BookWithEntry) => {
    await openBook(book.id); setCurrentBook(book); router.push("/reader");
  }, [openBook, setCurrentBook, router]);

  const handleDeleteFolder = useCallback((folder: FolderWithBooks) => {
    Alert.alert("Delete Folder", `Delete "${folder.name}"? Books won't be removed from your library.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteFolder(folder.id) },
    ]);
  }, [deleteFolder]);

  const getFolderBooks = useCallback(
    (folder: FolderWithBooks): BookWithEntry[] => folder.bookIds.map((id) => bookMap.get(id)).filter(Boolean) as BookWithEntry[],
    [bookMap]
  );

  const clearAllControls = useCallback(() => {
    setSearchQuery(""); setSortKey("date_added"); setSortDir("desc");
    setFilters(EMPTY_FILTERS);
  }, []);

  const openDetail = useCallback((bookId: number) => {
    const book = bookMap.get(bookId);
    if (book) setDetailBook(book);
  }, [bookMap]);

  const closeOpenSwipeable = useCallback(() => { openSwipeableRef.current?.close(); openSwipeableRef.current = null; }, []);
  const handleSwipeableWillOpen = useCallback((ref: Swipeable) => {
    if (openSwipeableRef.current && openSwipeableRef.current !== ref) openSwipeableRef.current.close();
    openSwipeableRef.current = ref;
  }, []);

  const handleSheetStartReading = useCallback(async (bookId: number) => { await startReading(bookId); }, [startReading]);
  const handleSheetFinish = useCallback(async (bookId: number) => { await finishReading(bookId); }, [finishReading]);
  const handleSheetDNF = useCallback(async (bookId: number) => { await markDNF(bookId); }, [markDNF]);
  const handleSheetOpenReader = useCallback(async (bookId: number) => {
    const book = bookMap.get(bookId); if (book) await handleOpenReader(book);
  }, [bookMap, handleOpenReader]);
  const handleSheetDelete = useCallback(async (bookId: number) => {
    await deleteBook(bookId);
    setDetailBook(null);
  }, [deleteBook]);

  const handleLetterSelect = useCallback((letter: string) => {
    const y = letterPositions.current.get(letter);
    if (y != null) scrollRef.current?.scrollTo({ y, animated: true });
  }, []);

  const registerLetterPosition = useCallback((letter: string, event: LayoutChangeEvent) => {
    letterPositions.current.set(letter, event.nativeEvent.layout.y);
  }, []);

  const renderCompactRows = useCallback((list: BookWithEntry[]) =>
    list.map((book) => (
      <CompactBookRow key={book.id} book={book} progress={progressMap.get(book.id)}
        onPress={() => openDetail(book.id)} onLongPress={() => openDetail(book.id)}
        onStartReading={() => startReading(book.id)} onMarkFinished={() => finishReading(book.id)}
        onMarkDNF={() => markDNF(book.id)} onSwipeableWillOpen={handleSwipeableWillOpen} />
    )),
    [progressMap, openDetail, startReading, finishReading, markDNF, handleSwipeableWillOpen]
  );

  const showAlphabetView = activeTab !== "all" && !isControlsActive;

  return (
    <View style={s.root}>
      <ScrollView
        ref={scrollRef} style={s.scroller}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={t.color.accent.light} />}
        onScrollBeginDrag={closeOpenSwipeable}
      >
        {/* ── Header ─────────────────────────────────── */}
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>My Library</Text>
            <Text style={s.headerSub}>{books.length} {books.length === 1 ? "book" : "books"}</Text>
          </View>
          <Pressable style={({ pressed }) => [s.addBtn, pressed && s.addBtnPressed]} onPress={goToSearch}>
            <IconSymbol name="plus" size={13} color="#fff" />
            <Text style={s.addBtnText}>Add</Text>
          </Pressable>
        </View>

        {/* ── Search + Filter ────────────────────────── */}
        <View style={ctrl.searchRow}>
          <View style={{ flex: 1 }}>
            <SearchBar value={searchQuery} onChangeText={setSearchQuery} placeholder="Search title or author…" />
          </View>
          <Pressable
            style={[ctrl.filterBtn, activeFilterCount > 0 && ctrl.filterBtnActive]}
            onPress={() => setShowFilterModal(true)}
          >
            <IconSymbol
              name="slider.horizontal.3"
              size={16}
              color={activeFilterCount > 0 ? t.color.accent.lighter : t.color.text.tertiary}
            />
            {activeFilterCount > 0 && (
              <View style={ctrl.filterBadge}><Text style={ctrl.filterBadgeText}>{activeFilterCount}</Text></View>
            )}
          </Pressable>
        </View>

        {/* ── Segmented Control ──────────────────────── */}
        <SegmentedControl segments={segments} activeKey={activeTab} onChange={(k) => {
          setActiveTab(k as TabKey);
          letterPositions.current.clear();
          scrollRef.current?.scrollTo({ y: 0, animated: false });
        }} />

        {/* ── Sort Strip ─────────────────────────────── */}
        <SortStrip sortKey={sortKey} sortDir={sortDir}
          onSelect={setSortKey} onToggleDir={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))} />

        {/* ── Active controls bar ────────────────────── */}
        {isControlsActive && (
          <View style={ctrl.activeBar}>
            <Text style={ctrl.resultCount}>
              {filteredSorted.length} {filteredSorted.length === 1 ? "result" : "results"}
            </Text>
            <Pressable style={ctrl.resetBtn} onPress={clearAllControls} hitSlop={8}>
              <Text style={ctrl.resetText}>Reset</Text>
            </Pressable>
          </View>
        )}

        {/* ── Loading ────────────────────────────────── */}
        {isLoading && books.length === 0 && (
          <View style={s.loader}><ActivityIndicator color={t.color.accent.light} size="large" /></View>
        )}

        {/* ── Content ────────────────────────────────── */}
        {/* Smart Collections — shown only on "All" tab */}
        {activeTab === "all" && smartCollections.length > 0 && (
          <View style={s.smartCollectionsWrap}>
            <Text style={s.smartCollectionsLabel}>Collections</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.smartCollectionsRow}
            >
              {activeSmartCollection && (
                <Pressable
                  style={[s.smartChip, s.smartChipClear]}
                  onPress={() => {
                    setActiveSmartCollection(null);
                    setSmartCollectionBookIds([]);
                  }}
                >
                  <Text style={s.smartChipClearText}>Clear</Text>
                </Pressable>
              )}
              {smartCollections.map((sc) => {
                const isActive = activeSmartCollection === sc.id;
                return (
                  <Pressable
                    key={sc.id}
                    style={[s.smartChip, isActive && s.smartChipActive]}
                    onPress={async () => {
                      if (isActive) {
                        setActiveSmartCollection(null);
                        setSmartCollectionBookIds([]);
                      } else {
                        setActiveSmartCollection(sc.id);
                        const ids = await getSmartCollectionBookIds(sc.id);
                        setSmartCollectionBookIds(ids);
                      }
                    }}
                  >
                    <IconSymbol name={sc.icon as any} size={14} color={isActive ? "#fff" : sc.color} />
                    <Text style={[s.smartChipText, isActive && s.smartChipTextActive]}>
                      {sc.name}
                    </Text>
                    <Text style={[s.smartChipCount, isActive && s.smartChipCountActive]}>
                      {sc.count}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {isControlsActive ? (
          <View style={s.flatSection}>
            {filteredSorted.length > 0 ? renderCompactRows(filteredSorted) : (
              <View style={s.noResults}>
                <Text style={s.noResultsEmoji}>📭</Text>
                <Text style={s.noResultsText}>No books match your criteria</Text>
              </View>
            )}
          </View>
        ) : activeTab === "all" && !activeSmartCollection ? (
          <>
            <CoverShelf title="Currently Reading" data={currentlyReading} progressMap={progressMap}
              onPress={openDetail} onLongPress={openDetail} accent />
            <CoverShelf title="Recently Read" data={recentShelfBooks} progressMap={progressMap}
              onPress={openDetail} onLongPress={openDetail} />
            {seriesGroups.map((sg) => (
              <CoverShelf key={sg.name} title={sg.name} data={sg.books} progressMap={progressMap}
                onPress={openDetail} onLongPress={openDetail} />
            ))}
            {folders.length > 0 && (
              <View style={s.divider}>
                <View style={s.dividerLine} /><Text style={s.dividerLabel}>Folders</Text><View style={s.dividerLine} />
              </View>
            )}
            {folders.map((folder) => {
              const fBooks = getFolderBooks(folder);
              return (
                <CollapsibleSection key={`f-${folder.id}`} title={folder.name} emoji="📁" count={fBooks.length}
                  accentColor={folder.color} defaultExpanded={false}
                  rightAction={<Pressable style={s.deleteBtn} onPress={() => handleDeleteFolder(folder)} hitSlop={8}><Text style={s.deleteText}>✕</Text></Pressable>}>
                  {fBooks.length > 0 ? renderCompactRows(fBooks) : <EmptySection onAdd={goToSearch} />}
                </CollapsibleSection>
              );
            })}
            <Pressable style={s.newFolderBtn} onPress={() => setShowNewFolder(true)}>
              <Text style={s.newFolderPlus}>+</Text><Text style={s.newFolderLabel}>New Folder</Text>
            </Pressable>
          </>
        ) : activeTab === "all" && activeSmartCollection ? (
          <View style={s.flatSection}>
            {filteredSorted.length > 0 ? renderCompactRows(filteredSorted) : (
              <View style={s.noResults}>
                <Text style={s.noResultsEmoji}>📭</Text>
                <Text style={s.noResultsText}>No books in this collection</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={s.alphabetContent}>
            {letterGroups.length === 0 ? (
              <EmptySection onAdd={goToSearch} />
            ) : (
              letterGroups.map((group) => (
                <View key={group.letter} onLayout={(e) => registerLetterPosition(group.letter, e)}>
                  <View style={s.letterHeader}>
                    <Text style={s.letterText}>{group.letter}</Text>
                    <View style={s.letterLine} />
                  </View>
                  {renderCompactRows(group.books)}
                </View>
              ))
            )}
          </View>
        )}

        <View style={{ height: t.space._10 }} />
      </ScrollView>

      {showAlphabetView && availableLetters.length > 1 && (
        <AlphabetIndex letters={availableLetters} onSelect={handleLetterSelect} />
      )}

      <FilterSheet visible={showFilterModal} filters={filters} onChange={setFilters}
        onApply={() => setShowFilterModal(false)} onClear={() => setFilters(EMPTY_FILTERS)}
        onClose={() => setShowFilterModal(false)}
        uniqueGenres={uniqueGenres} uniqueAuthors={uniqueAuthors} tags={tags} />
      <NewFolderModal visible={showNewFolder} onClose={() => setShowNewFolder(false)}
        onCreate={(n, c) => createFolder(n, c)} />
      <BookDetailSheet book={detailBook} progress={detailBook ? progressMap.get(detailBook.id) : undefined}
        visible={detailBook !== null} onClose={() => setDetailBook(null)}
        onStartReading={handleSheetStartReading} onMarkFinished={handleSheetFinish}
        onMarkDNF={handleSheetDNF} onOpenReader={handleSheetOpenReader}
        onDeleteBook={handleSheetDelete} />
    </View>
  );
}

/* ══════════════════════════════════════════════════════
   Styles
   ══════════════════════════════════════════════════════ */

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: t.color.bg.base },
  scroller: { flex: 1 },

  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: t.space._5, paddingTop: t.space._6, paddingBottom: t.space._3,
  },
  headerTitle: { ...t.font.display },
  headerSub: { ...t.font.caption, color: t.color.text.tertiary, marginTop: 3 },
  addBtn: {
    flexDirection: "row", alignItems: "center", gap: t.space._1 + 1,
    backgroundColor: t.color.accent.strong,
    paddingHorizontal: t.space._4,
    paddingVertical: t.space._2 + 2,
    borderRadius: t.radius.pill,
    ...t.shadow.soft,
  },
  addBtnText: { color: "#fff", fontSize: 13, fontWeight: "700", letterSpacing: -0.1 },
  addBtnPressed: { opacity: 0.82, transform: [{ scale: 0.96 }] },
  loader: { alignItems: "center", paddingVertical: t.space._16 - 4 },

  section: { marginTop: t.space._4 },
  sectionRight: { flexDirection: "row", alignItems: "center", gap: t.space._3 },
  seeAllText: { color: t.color.accent.base, fontSize: 12, fontWeight: "600" },
  sectionBody: { marginTop: 2 },

  emptyCard: {
    marginHorizontal: t.space._5, marginBottom: t.space._3,
    borderWidth: 1.5, borderStyle: "dashed", borderColor: t.color.border.default,
    borderRadius: t.radius["3xl"], paddingVertical: t.space._6,
    alignItems: "center",
  },
  emptyCircle: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: t.color.bg.raised,
    borderWidth: 1, borderColor: t.color.border.strong,
    alignItems: "center", justifyContent: "center", marginBottom: t.space._2,
  },
  emptyPlus: { color: t.color.accent.light, fontSize: 22, fontWeight: "300", marginTop: -2 },
  emptyLabel: { ...t.font.caption, color: t.color.text.muted },

  divider: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: t.space._5, marginTop: t.space._6, marginBottom: t.space._1,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: t.color.border.default },
  dividerLabel: { ...t.font.label, color: t.color.text.muted, marginHorizontal: t.space._3, letterSpacing: 1.5 },

  deleteBtn: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: t.color.bg.overlay,
    alignItems: "center", justifyContent: "center",
  },
  deleteText: { color: t.color.text.tertiary, fontSize: 11, fontWeight: "700" },

  newFolderBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    marginHorizontal: t.space._5, marginTop: t.space._4, paddingVertical: t.space._4 - 2,
    borderRadius: t.radius.xl, borderWidth: 1, borderColor: t.color.border.default,
    borderStyle: "dashed", backgroundColor: t.color.glass.bg,
  },
  newFolderPlus: { color: t.color.accent.light, fontSize: 20, marginRight: t.space._2 },
  newFolderLabel: { ...t.font.caption, color: t.color.text.secondary },

  flatSection: { marginTop: t.space._1 },
  noResults: { alignItems: "center", paddingVertical: t.space._12 },
  noResultsEmoji: { fontSize: 36, marginBottom: t.space._2 },
  noResultsText: { ...t.font.body, color: t.color.text.muted },

  alphabetContent: { marginTop: t.space._1, paddingRight: 22 },
  letterHeader: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: t.space._5, paddingTop: t.space._4 - 2, paddingBottom: t.space._2,
  },
  letterText: {
    color: t.color.accent.light, fontSize: 14, fontWeight: "800",
    width: 22, textAlign: "center",
  },
  letterLine: {
    flex: 1, height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(90,157,212,0.22)", marginLeft: t.space._2,
  },

  /* Smart Collections */
  smartCollectionsWrap: {
    marginBottom: t.space._4,
  },
  smartCollectionsLabel: {
    ...t.font.label,
    paddingHorizontal: t.space._2,
    marginBottom: t.space._2,
  },
  smartCollectionsRow: {
    paddingHorizontal: t.space._1,
    gap: t.space._2,
  },
  smartChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space._1,
    paddingVertical: t.space._2,
    paddingHorizontal: t.space._3,
    borderRadius: t.radius.pill,
    backgroundColor: t.color.bg.raised,
    borderWidth: 1,
    borderColor: t.color.border.subtle,
  },
  smartChipActive: {
    backgroundColor: t.color.accent.base,
    borderColor: t.color.accent.base,
  },
  smartChipClear: {
    backgroundColor: t.color.bg.overlay,
    borderColor: t.color.border.strong,
  },
  smartChipClearText: {
    ...t.font.caption,
    color: t.color.text.secondary,
  },
  smartChipText: {
    ...t.font.caption,
    color: t.color.text.secondary,
  },
  smartChipTextActive: {
    color: "#fff",
    fontWeight: "700",
  },
  smartChipCount: {
    ...t.font.micro,
    color: t.color.text.muted,
    marginLeft: t.space._1,
  },
  smartChipCountActive: {
    color: "rgba(255,255,255,0.8)",
  },
});

const ctrl = StyleSheet.create({
  searchRow: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: t.space._4, marginTop: t.space._1, marginBottom: t.space._1, gap: t.space._2,
  },
  filterBtn: {
    width: 42, height: 42, borderRadius: t.radius["3xl"],
    backgroundColor: t.color.bg.raised, borderWidth: 1, borderColor: t.color.border.default,
    alignItems: "center", justifyContent: "center",
  },
  filterBtnActive: { borderColor: t.color.accent.strong, backgroundColor: t.color.accent.bg },
  filterBadge: {
    position: "absolute", top: -4, right: -4,
    backgroundColor: t.color.accent.strong, borderRadius: t.radius.md,
    minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
  },
  filterBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },

  activeBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: t.space._5, marginTop: t.space._2,
  },
  resultCount: { ...t.font.caption, color: t.color.text.muted },
  resetBtn: { paddingHorizontal: t.space._3, paddingVertical: t.space._1 },
  resetText: { color: t.color.accent.base, fontSize: 12, fontWeight: "600" },
});

const srt = StyleSheet.create({
  strip: { paddingHorizontal: t.space._4, paddingVertical: t.space._2, gap: t.space._2 - 2 },
  pill: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: t.space._3, paddingVertical: 5, borderRadius: t.radius.md,
    backgroundColor: t.color.glass.bg, borderWidth: 1, borderColor: t.color.glass.border,
  },
  pillActive: { backgroundColor: t.color.accent.bg, borderColor: t.color.accent.border },
  pillLabel: { color: t.color.text.muted, fontSize: 12, fontWeight: "600" },
  pillLabelActive: { color: t.color.accent.strong },
  pillPressed: { opacity: 0.7 },
  dirArrow: { color: t.color.accent.lighter, fontSize: 11, fontWeight: "800", marginRight: 3 },
});

const modal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(56,73,89,0.55)", justifyContent: "center", alignItems: "center", padding: t.space._8 },
  card: {
    width: "100%", maxWidth: 360, backgroundColor: t.color.bg.overlay,
    borderRadius: t.radius["3xl"], padding: t.space._6, borderWidth: 1, borderColor: t.color.border.accent,
  },
  title: { ...t.font.title, marginBottom: t.space._4 },
  input: {
    backgroundColor: t.color.bg.base, borderRadius: t.radius.lg, borderWidth: 1, borderColor: t.color.border.accent,
    paddingHorizontal: t.space._4 - 2, paddingVertical: t.space._3, color: t.color.text.primary,
    fontSize: 16, marginBottom: t.space._4,
  },
  colorLabel: { ...t.font.caption, color: t.color.text.secondary, marginBottom: t.space._2 },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: t.space._3, marginBottom: t.space._5 },
  colorDot: { width: 32, height: 32, borderRadius: 16 },
  colorDotActive: { borderWidth: 3, borderColor: "#fff" },
  actions: { flexDirection: "row", gap: t.space._3 },
  cancelBtn: {
    flex: 1, paddingVertical: t.space._3, borderRadius: t.radius.lg,
    backgroundColor: t.color.bg.base, alignItems: "center", borderWidth: 1, borderColor: t.color.border.accent,
  },
  cancelText: { ...t.font.headline, color: t.color.text.secondary },
  createBtn: { flex: 1, paddingVertical: t.space._3, borderRadius: t.radius.lg, backgroundColor: t.color.accent.strong, alignItems: "center" },
  createText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
