import { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import {
  useLibraryStore,
  type BookWithEntry,
  type BookStatus,
  type FolderWithBooks,
} from "@/store/libraryStore";
import { getOne } from "@/db/database";

/* ── Types ──────────────────────────────────────────── */

interface ProgressRow {
  current_page: number;
  percentage: number;
}

const SECTIONS: { key: BookStatus; title: string; emoji: string; emptyText: string; showProgress: boolean }[] = [
  { key: "reading", title: "Currently Reading", emoji: "📖", emptyText: "Nothing in progress", showProgress: true },
  { key: "want_to_read", title: "Want to Read", emoji: "📋", emptyText: "Add books you want to read", showProgress: false },
  { key: "finished", title: "Finished", emoji: "✅", emptyText: "No finished books yet", showProgress: false },
  { key: "dnf", title: "Did Not Finish", emoji: "🚫", emptyText: "No abandoned books", showProgress: true },
];

const FOLDER_COLORS = ["#818cf8", "#f472b6", "#34d399", "#fbbf24", "#fb923c", "#a78bfa", "#38bdf8", "#f87171"];

/* ── Small components ───────────────────────────────── */

function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <Text style={styles.stars}>
      {"★".repeat(full)}{"☆".repeat(5 - full)}
    </Text>
  );
}

function ProgressBar({ bookId }: { bookId: number }) {
  const [progress, setProgress] = useState<ProgressRow | null>(null);

  useEffect(() => {
    getOne<ProgressRow>(
      "SELECT current_page, percentage FROM reading_progress WHERE book_id = ?",
      [bookId]
    ).then(setProgress);
  }, [bookId]);

  const pct = progress?.percentage ?? 0;

  return (
    <View style={styles.progressWrap}>
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${Math.min(pct, 100)}%` }]} />
      </View>
      {pct > 0 && <Text style={styles.progressText}>{Math.round(pct)}%</Text>}
    </View>
  );
}

function BookCard({ book, showProgress }: { book: BookWithEntry; showProgress: boolean }) {
  const { entry } = book;

  return (
    <Pressable style={styles.bookCard}>
      <View>
        {book.cover_url ? (
          <Image source={{ uri: book.cover_url }} style={styles.bookCover} contentFit="cover" />
        ) : (
          <View style={[styles.bookCover, styles.bookCoverPlaceholder]}>
            <Text style={styles.coverPlaceholderEmoji}>📖</Text>
          </View>
        )}

        {/* Overlay progress bar at bottom of cover for reading/dnf */}
        {showProgress && (
          <View style={styles.coverProgressWrap}>
            <View style={styles.coverProgressBg}>
              <OverlayProgress bookId={book.id} />
            </View>
          </View>
        )}
      </View>

      <Text style={styles.bookCardTitle} numberOfLines={2}>{book.title}</Text>
      <Text style={styles.bookCardAuthor} numberOfLines={1}>
        {book.authors ?? "Unknown author"}
      </Text>

      {showProgress && <ProgressBar bookId={book.id} />}
      {entry.status === "finished" && entry.rating != null && <Stars rating={entry.rating} />}
    </Pressable>
  );
}

function OverlayProgress({ bookId }: { bookId: number }) {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    getOne<ProgressRow>(
      "SELECT current_page, percentage FROM reading_progress WHERE book_id = ?",
      [bookId]
    ).then((row) => setPct(row?.percentage ?? 0));
  }, [bookId]);

  return <View style={[styles.coverProgressFill, { width: `${Math.min(pct, 100)}%` }]} />;
}

function AddBookCard({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.addBookCard} onPress={onPress}>
      <View style={styles.addBookCover}>
        <View style={styles.addBookIconCircle}>
          <Text style={styles.addBookPlus}>+</Text>
        </View>
      </View>
      <Text style={styles.addBookLabel}>Add Book</Text>
    </Pressable>
  );
}

/* ── Collapsible Section ────────────────────────────── */

function CollapsibleSection({
  title,
  emoji,
  emptyText,
  showProgress,
  books,
  onAddPress,
  defaultExpanded = true,
  accentColor,
  rightAction,
}: {
  title: string;
  emoji: string;
  emptyText: string;
  showProgress: boolean;
  books: BookWithEntry[];
  onAddPress: () => void;
  defaultExpanded?: boolean;
  accentColor?: string;
  rightAction?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const data = [...books, { _isAddCard: true as const }];

  return (
    <View style={styles.section}>
      <Pressable
        style={styles.sectionHeader}
        onPress={() => setExpanded((e) => !e)}
      >
        <View style={styles.sectionHeaderLeft}>
          <Text style={styles.chevron}>{expanded ? "▾" : "▸"}</Text>
          {accentColor && <View style={[styles.folderDot, { backgroundColor: accentColor }]} />}
          <Text style={styles.sectionTitle}>{emoji} {title}</Text>
          {books.length > 0 && (
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>{books.length}</Text>
            </View>
          )}
        </View>
        <View style={styles.sectionHeaderRight}>
          {rightAction}
        </View>
      </Pressable>

      {expanded && (
        <>
          {books.length === 0 && (
            <Text style={styles.sectionEmptyHint}>{emptyText}</Text>
          )}

          <FlatList
            data={data}
            keyExtractor={(item, idx) =>
              "_isAddCard" in item ? `add-${idx}` : String(item.id)
            }
            renderItem={({ item }) =>
              "_isAddCard" in item ? (
                <AddBookCard onPress={onAddPress} />
              ) : (
                <BookCard book={item as BookWithEntry} showProgress={showProgress} />
              )
            }
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sectionList}
          />
        </>
      )}
    </View>
  );
}

/* ── New Folder Modal ───────────────────────────────── */

function NewFolderModal({
  visible,
  onClose,
  onCreate,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string, color: string) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(FOLDER_COLORS[0]);

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate(name.trim(), color);
    setName("");
    setColor(FOLDER_COLORS[0]);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={modalStyles.overlay} onPress={onClose}>
        <Pressable style={modalStyles.card} onPress={() => {}}>
          <Text style={modalStyles.title}>New Folder</Text>

          <TextInput
            style={modalStyles.input}
            placeholder="Folder name..."
            placeholderTextColor="#6b7280"
            value={name}
            onChangeText={setName}
            autoFocus
            maxLength={40}
          />

          <Text style={modalStyles.colorLabel}>Color</Text>
          <View style={modalStyles.colorRow}>
            {FOLDER_COLORS.map((c) => (
              <Pressable
                key={c}
                style={[
                  modalStyles.colorDot,
                  { backgroundColor: c },
                  color === c && modalStyles.colorDotSelected,
                ]}
                onPress={() => setColor(c)}
              />
            ))}
          </View>

          <View style={modalStyles.actions}>
            <Pressable style={modalStyles.cancelBtn} onPress={onClose}>
              <Text style={modalStyles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[modalStyles.createBtn, !name.trim() && modalStyles.createBtnDisabled]}
              onPress={handleCreate}
              disabled={!name.trim()}
            >
              <Text style={modalStyles.createBtnText}>Create</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ── Main Library Screen ────────────────────────────── */

export default function LibraryScreen() {
  const { books, folders, isLoading, loadLibrary, createFolder, deleteFolder } = useLibraryStore();
  const router = useRouter();
  const [showNewFolder, setShowNewFolder] = useState(false);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  const grouped = useMemo(() => {
    const map = new Map<BookStatus, BookWithEntry[]>();
    for (const s of SECTIONS) map.set(s.key, []);
    for (const book of books) {
      map.get(book.entry.status)?.push(book);
    }
    return map;
  }, [books]);

  const bookMap = useMemo(() => {
    const m = new Map<number, BookWithEntry>();
    for (const b of books) m.set(b.id, b);
    return m;
  }, [books]);

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadLibrary();
    setRefreshing(false);
  }, [loadLibrary]);

  const goToSearch = useCallback(() => {
    router.push("/search");
  }, [router]);

  const handleCreateFolder = useCallback(
    async (name: string, color: string) => {
      await createFolder(name, color);
    },
    [createFolder]
  );

  const handleDeleteFolder = useCallback(
    (folder: FolderWithBooks) => {
      Alert.alert(
        "Delete Folder",
        `Delete "${folder.name}"? Books won't be removed from your library.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => deleteFolder(folder.id) },
        ]
      );
    },
    [deleteFolder]
  );

  const getFolderBooks = useCallback(
    (folder: FolderWithBooks): BookWithEntry[] =>
      folder.bookIds.map((id) => bookMap.get(id)).filter(Boolean) as BookWithEntry[],
    [bookMap]
  );

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#818cf8" />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>My Library</Text>
            <Text style={styles.headerCount}>
              {books.length} {books.length === 1 ? "book" : "books"}
            </Text>
          </View>
          <Pressable style={styles.headerAddBtn} onPress={goToSearch}>
            <Text style={styles.headerAddBtnText}>+ Add Book</Text>
          </Pressable>
        </View>
      </View>

      {/* Loading */}
      {isLoading && books.length === 0 && (
        <View style={styles.centerState}>
          <ActivityIndicator color="#818cf8" size="large" />
        </View>
      )}

      {/* Built-in sections */}
      {SECTIONS.map((section) => (
        <CollapsibleSection
          key={section.key}
          title={section.title}
          emoji={section.emoji}
          emptyText={section.emptyText}
          showProgress={section.showProgress}
          books={grouped.get(section.key) ?? []}
          onAddPress={goToSearch}
        />
      ))}

      {/* Divider */}
      <View style={styles.folderDivider}>
        <View style={styles.folderDividerLine} />
        <Text style={styles.folderDividerText}>Folders</Text>
        <View style={styles.folderDividerLine} />
      </View>

      {/* Custom folders */}
      {folders.map((folder) => (
        <CollapsibleSection
          key={`folder-${folder.id}`}
          title={folder.name}
          emoji="📁"
          emptyText="No books in this folder yet"
          showProgress={false}
          books={getFolderBooks(folder)}
          onAddPress={goToSearch}
          accentColor={folder.color}
          rightAction={
            <Pressable
              style={styles.folderDeleteBtn}
              onPress={() => handleDeleteFolder(folder)}
              hitSlop={8}
            >
              <Text style={styles.folderDeleteText}>✕</Text>
            </Pressable>
          }
        />
      ))}

      {/* New Folder button */}
      <Pressable style={styles.newFolderBtn} onPress={() => setShowNewFolder(true)}>
        <Text style={styles.newFolderPlus}>+</Text>
        <Text style={styles.newFolderText}>New Folder</Text>
      </Pressable>

      <View style={{ height: 40 }} />

      <NewFolderModal
        visible={showNewFolder}
        onClose={() => setShowNewFolder(false)}
        onCreate={handleCreateFolder}
      />
    </ScrollView>
  );
}

/* ── Styles ─────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerTitle: { color: "#ffffff", fontSize: 28, fontWeight: "800" },
  headerCount: { color: "#6b7280", fontSize: 14, marginTop: 2 },
  headerAddBtn: { backgroundColor: "#4f46e5", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, marginTop: 4 },
  headerAddBtnText: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
  centerState: { alignItems: "center", paddingVertical: 60, paddingHorizontal: 32 },

  section: { marginTop: 20 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  sectionHeaderLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  sectionHeaderRight: { flexDirection: "row", alignItems: "center" },
  chevron: { color: "#6b7280", fontSize: 14, marginRight: 6, width: 14 },
  folderDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  sectionTitle: { color: "#f3f4f6", fontSize: 16, fontWeight: "700" },
  sectionBadge: { marginLeft: 8, backgroundColor: "#1c1c1e", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  sectionBadgeText: { color: "#9ca3af", fontSize: 12, fontWeight: "600" },
  sectionEmptyHint: { color: "#4b5563", fontSize: 13, paddingHorizontal: 20, paddingLeft: 40, marginBottom: 4 },
  sectionList: { paddingHorizontal: 16, paddingTop: 4 },

  bookCard: { width: 120, marginRight: 12 },
  bookCover: { width: 120, height: 170, borderRadius: 10, backgroundColor: "#1c1c1e" },
  bookCoverPlaceholder: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#2c2c2e" },
  coverPlaceholderEmoji: { fontSize: 32 },

  coverProgressWrap: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 6, paddingBottom: 6 },
  coverProgressBg: { height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)", overflow: "hidden" },
  coverProgressFill: { height: 3, borderRadius: 2, backgroundColor: "#818cf8" },

  bookCardTitle: { color: "#f3f4f6", fontSize: 13, fontWeight: "700", marginTop: 6, lineHeight: 17 },
  bookCardAuthor: { color: "#9ca3af", fontSize: 11, marginTop: 2 },
  stars: { color: "#fbbf24", fontSize: 11, marginTop: 4 },

  progressWrap: { marginTop: 4, width: "100%" },
  progressBg: { height: 3, width: "100%", borderRadius: 2, backgroundColor: "#2c2c2e" },
  progressFill: { height: 3, borderRadius: 2, backgroundColor: "#818cf8" },
  progressText: { color: "#6b7280", fontSize: 10, marginTop: 2 },

  addBookCard: { width: 120, marginRight: 12, alignItems: "center" },
  addBookCover: {
    width: 120, height: 170, borderRadius: 10, borderWidth: 2,
    borderColor: "#2c2c2e", borderStyle: "dashed", backgroundColor: "#111113",
    alignItems: "center", justifyContent: "center",
  },
  addBookIconCircle: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: "#1c1c1e",
    borderWidth: 1, borderColor: "#3f3f46", alignItems: "center", justifyContent: "center",
  },
  addBookPlus: { color: "#818cf8", fontSize: 28, fontWeight: "300", marginTop: -2 },
  addBookLabel: { color: "#6b7280", fontSize: 12, fontWeight: "600", marginTop: 6 },

  folderDivider: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 20,
    marginTop: 28, marginBottom: 4,
  },
  folderDividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: "#2c2c2e" },
  folderDividerText: { color: "#6b7280", fontSize: 12, fontWeight: "600", marginHorizontal: 12, textTransform: "uppercase", letterSpacing: 1 },

  folderDeleteBtn: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: "#1c1c1e",
    alignItems: "center", justifyContent: "center",
  },
  folderDeleteText: { color: "#6b7280", fontSize: 11, fontWeight: "700" },

  newFolderBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    marginHorizontal: 20, marginTop: 16, paddingVertical: 14,
    borderRadius: 12, borderWidth: 1, borderColor: "#2c2c2e", borderStyle: "dashed",
    backgroundColor: "#111113",
  },
  newFolderPlus: { color: "#818cf8", fontSize: 20, fontWeight: "400", marginRight: 8 },
  newFolderText: { color: "#9ca3af", fontSize: 14, fontWeight: "600" },
});

/* ── Modal Styles ───────────────────────────────────── */

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center", alignItems: "center", padding: 32,
  },
  card: {
    width: "100%", maxWidth: 360, backgroundColor: "#1c1c1e",
    borderRadius: 16, padding: 24, borderWidth: 1, borderColor: "#2c2c2e",
  },
  title: { color: "#ffffff", fontSize: 20, fontWeight: "800", marginBottom: 16 },
  input: {
    backgroundColor: "#0a0a0a", borderRadius: 10, borderWidth: 1, borderColor: "#2c2c2e",
    paddingHorizontal: 14, paddingVertical: 12, color: "#ffffff", fontSize: 16, marginBottom: 16,
  },
  colorLabel: { color: "#9ca3af", fontSize: 13, fontWeight: "600", marginBottom: 8 },
  colorRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  colorDot: { width: 32, height: 32, borderRadius: 16 },
  colorDotSelected: { borderWidth: 3, borderColor: "#ffffff" },
  actions: { flexDirection: "row", gap: 10 },
  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: "#0a0a0a", alignItems: "center",
    borderWidth: 1, borderColor: "#2c2c2e",
  },
  cancelBtnText: { color: "#9ca3af", fontSize: 15, fontWeight: "600" },
  createBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: "#4f46e5", alignItems: "center",
  },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
});
