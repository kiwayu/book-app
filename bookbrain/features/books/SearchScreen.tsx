import { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  Keyboard,
  StyleSheet,
  Modal,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import {
  searchBooks,
  fetchBookDescription,
  type GoogleBook,
} from "@/services/googleBooks";
import { useLibraryStore } from "@/store/libraryStore";
import { t } from "@/theme";

const DEBOUNCE_MS = 350;

/* ── Book Detail Modal ──────────────────────────────── */

function BookDetailModal({
  book,
  visible,
  added,
  onClose,
  onAdd,
}: {
  book: GoogleBook | null;
  visible: boolean;
  added: boolean;
  onClose: () => void;
  onAdd: () => void;
}) {
  const [description,  setDescription]  = useState<string | null>(null);
  const [loadingDesc,  setLoadingDesc]  = useState(false);

  useEffect(() => {
    if (!book || !visible) { setDescription(null); return; }
    if (book.description) { setDescription(book.description); return; }
    let cancelled = false;
    setLoadingDesc(true);
    fetchBookDescription(book.id).then((desc) => {
      if (!cancelled) { setDescription(desc); setLoadingDesc(false); }
    });
    return () => { cancelled = true; };
  }, [book, visible]);

  if (!book) return null;

  const desc      = description ?? book.description;
  const plainDesc = desc
    ? desc.replace(/<[^>]+>/g, "").replace(/&[^;]+;/g, " ").trim()
    : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={m.container}>
        <View style={m.handleWrap}>
          <View style={m.handle} />
        </View>

        <Pressable style={m.closeBtn} onPress={onClose}>
          <Text style={m.closeBtnText}>✕</Text>
        </Pressable>

        <ScrollView
          style={m.scroll}
          contentContainerStyle={m.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={m.coverWrap}>
            {book.coverLarge || book.cover ? (
              <Image
                source={{ uri: book.coverLarge ?? book.cover ?? undefined }}
                style={m.cover}
                contentFit="cover"
              />
            ) : (
              <View style={[m.cover, m.coverPlaceholder]}>
                <Text style={m.coverPlaceholderText}>📖</Text>
              </View>
            )}
          </View>

          <Text style={m.title}>{book.title}</Text>
          <Text style={m.authors}>
            {book.authors.length > 0 ? book.authors.join(", ") : "Unknown author"}
          </Text>

          <View style={m.metaRow}>
            {book.publishedYear != null && (
              <View style={m.pill}>
                <Text style={m.pillText}>{book.publishedYear}</Text>
              </View>
            )}
            {book.pageCount != null && (
              <View style={m.pill}>
                <Text style={m.pillText}>{book.pageCount} pages</Text>
              </View>
            )}
            {book.publisher && (
              <View style={m.pill}>
                <Text style={m.pillText}>{book.publisher}</Text>
              </View>
            )}
          </View>

          {book.categories.length > 0 && (
            <View style={m.categoriesRow}>
              {book.categories.slice(0, 4).map((cat, i) => (
                <View key={i} style={m.categoryPill}>
                  <Text style={m.categoryText}>{cat}</Text>
                </View>
              ))}
            </View>
          )}

          {book.isbn && (
            <Text style={m.isbn}>ISBN: {book.isbn}</Text>
          )}

          <View style={m.synopsisSection}>
            <Text style={m.synopsisLabel}>Synopsis</Text>
            {loadingDesc && !plainDesc && (
              <View style={m.descLoading}>
                <ActivityIndicator color={t.color.accent.base} size="small" />
                <Text style={m.descLoadingText}>Loading synopsis…</Text>
              </View>
            )}
            {plainDesc ? (
              <Text style={m.synopsisText}>{plainDesc}</Text>
            ) : !loadingDesc ? (
              <Text style={m.noSynopsis}>No synopsis available for this book.</Text>
            ) : null}
          </View>
        </ScrollView>

        <View style={m.bottomBar}>
          <Pressable
            style={[m.addLibraryBtn, added && m.addLibraryBtnDone]}
            onPress={onAdd}
            disabled={added}
          >
            <Text style={[m.addLibraryBtnText, added && m.addLibraryBtnTextDone]}>
              {added ? "✓ Added to Library" : "+ Add to Library"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/* ── Search Result Row ──────────────────────────────── */

function BookResult({
  item,
  added,
  onPress,
  onAdd,
}: {
  item: GoogleBook;
  added: boolean;
  onPress: () => void;
  onAdd: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [s.resultRow, pressed && s.resultRowPressed]}
      onPress={onPress}
    >
      {item.cover ? (
        <Image source={{ uri: item.cover }} style={s.cover} contentFit="cover" />
      ) : (
        <View style={[s.cover, s.coverPlaceholder]}>
          <Text style={s.coverPlaceholderText}>📖</Text>
        </View>
      )}

      <View style={s.resultInfo}>
        <Text style={s.bookTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={s.bookAuthor} numberOfLines={1}>
          {item.authors.length > 0 ? item.authors.join(", ") : "Unknown author"}
        </Text>
        <View style={s.metaRow}>
          {item.publishedYear != null && (
            <Text style={s.metaText}>{item.publishedYear}</Text>
          )}
          {item.pageCount != null && (
            <Text style={s.metaText}>
              {item.publishedYear != null ? " · " : ""}{item.pageCount} pages
            </Text>
          )}
        </View>
      </View>

      <View style={s.resultActions}>
        <Pressable
          onPress={(e) => { e.stopPropagation(); onAdd(); }}
          disabled={added}
          style={[s.addBtn, added && s.addBtnDone]}
        >
          <Text style={[s.addBtnText, added && s.addBtnTextDone]}>
            {added ? "✓" : "+"}
          </Text>
        </Pressable>
        <Text style={s.chevron}>›</Text>
      </View>
    </Pressable>
  );
}

/* ── Search Screen ──────────────────────────────────── */

export default function SearchScreen() {
  const [query,        setQuery]        = useState("");
  const [results,      setResults]      = useState<GoogleBook[]>([]);
  const [isSearching,  setIsSearching]  = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [addedIds,     setAddedIds]     = useState<Set<string>>(new Set());
  const [hasSearched,  setHasSearched]  = useState(false);
  const [selectedBook, setSelectedBook] = useState<GoogleBook | null>(null);

  const addBook  = useLibraryStore((s) => s.addBook);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setResults([]); setIsSearching(false); setHasSearched(false);
      return;
    }
    setIsSearching(true); setError(null); setHasSearched(true);
    try {
      const data = await searchBooks(trimmed);
      setResults(data);
    } catch {
      setError("Search failed. Please try again.");
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleChangeText = useCallback(
    (text: string) => {
      setQuery(text);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (text.trim().length >= 2) {
        timerRef.current = setTimeout(() => runSearch(text), DEBOUNCE_MS);
      } else {
        setResults([]); setHasSearched(false); setError(null);
      }
    },
    [runSearch]
  );

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const handleAdd = useCallback(
    async (book: GoogleBook) => {
      try {
        await addBook(book, "want_to_read");
        setAddedIds((prev) => new Set(prev).add(book.id));
      } catch { /* duplicate */ }
    },
    [addBook]
  );

  const showEmpty = hasSearched && !isSearching && !error && results.length === 0;

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Search</Text>
        <Text style={s.headerSub}>Find your next read</Text>
      </View>

      {/* Search bar */}
      <View style={s.searchBarWrap}>
        <View style={s.searchBar}>
          <Text style={s.searchIcon}>🔍</Text>
          <TextInput
            style={s.searchInput}
            placeholder="Title, author, or ISBN…"
            placeholderTextColor={t.color.text.faint}
            value={query}
            onChangeText={handleChangeText}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => {
              if (timerRef.current) clearTimeout(timerRef.current);
              runSearch(query);
              Keyboard.dismiss();
            }}
          />
          {query.length > 0 && (
            <Pressable
              onPress={() => { setQuery(""); setResults([]); setError(null); setHasSearched(false); }}
              style={s.clearBtn}
            >
              <Text style={s.clearBtnText}>✕</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Loading */}
      {isSearching && (
        <View style={s.centerState}>
          <ActivityIndicator color={t.color.accent.base} size="large" />
          <Text style={s.stateText}>Searching…</Text>
        </View>
      )}

      {/* Error */}
      {error && (
        <View style={s.centerState}>
          <Text style={s.emptyEmoji}>⚠️</Text>
          <Text style={s.errorText}>{error}</Text>
          <Pressable style={s.retryBtn} onPress={() => runSearch(query)}>
            <Text style={s.retryBtnText}>Try again</Text>
          </Pressable>
        </View>
      )}

      {/* Empty */}
      {showEmpty && (
        <View style={s.centerState}>
          <Text style={s.emptyEmoji}>📚</Text>
          <Text style={s.stateText}>No books found</Text>
          <Text style={s.stateSubtext}>Try a different search term</Text>
        </View>
      )}

      {/* Idle */}
      {!hasSearched && !isSearching && results.length === 0 && (
        <View style={s.centerState}>
          <Text style={s.emptyEmoji}>🔎</Text>
          <Text style={s.stateText}>Search for books</Text>
          <Text style={s.stateSubtext}>Tap a result to see full details and synopsis</Text>
        </View>
      )}

      {/* Results count */}
      {results.length > 0 && !isSearching && (
        <View style={s.resultsHeader}>
          <Text style={s.resultsCount}>
            {results.length} result{results.length !== 1 ? "s" : ""}
          </Text>
        </View>
      )}

      {/* Results list */}
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <BookResult
            item={item}
            added={addedIds.has(item.id)}
            onPress={() => setSelectedBook(item)}
            onAdd={() => handleAdd(item)}
          />
        )}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.listContent}
      />

      {/* Detail modal */}
      <BookDetailModal
        book={selectedBook}
        visible={selectedBook !== null}
        added={selectedBook ? addedIds.has(selectedBook.id) : false}
        onClose={() => setSelectedBook(null)}
        onAdd={() => { if (selectedBook) handleAdd(selectedBook); }}
      />
    </View>
  );
}

/* ── Search Screen Styles ───────────────────────────── */

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.color.bg.base,
  },
  header: {
    paddingHorizontal: t.space._5,
    paddingTop: t.space._4,
    paddingBottom: t.space._1,
  },
  headerTitle: {
    ...t.font.display,
  },
  headerSub: {
    ...t.font.body,
    color: t.color.text.tertiary,
    marginTop: 2,
  },
  searchBarWrap: {
    paddingHorizontal: t.space._4,
    paddingTop: t.space._3,
    paddingBottom: t.space._2,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: t.color.bg.raised,
    borderRadius: t.radius["2xl"],
    paddingHorizontal: t.space._4,
    paddingVertical: t.space._3,
    borderWidth: 1,
    borderColor: t.color.border.default,
    ...t.shadow.soft,
  },
  searchIcon: {
    fontSize: 15,
    marginRight: t.space._3,
  },
  searchInput: {
    flex: 1,
    color: t.color.text.primary,
    fontSize: 16,
  },
  clearBtn: {
    marginLeft: t.space._2,
    padding: 4,
  },
  clearBtnText: {
    color: t.color.text.muted,
    fontSize: 15,
    fontWeight: "600",
  },
  centerState: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  stateText: {
    ...t.font.headline,
    color: t.color.text.secondary,
    marginTop: t.space._3,
  },
  stateSubtext: {
    ...t.font.body,
    color: t.color.text.tertiary,
    marginTop: t.space._1,
  },
  emptyEmoji: {
    fontSize: 40,
  },
  errorText: {
    color: t.color.error.light,
    fontSize: 15,
    fontWeight: "600",
    marginTop: t.space._3,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: t.space._4,
    backgroundColor: t.color.bg.raised,
    paddingHorizontal: t.space._5,
    paddingVertical: t.space._3,
    borderRadius: t.radius.xl,
    borderWidth: 1,
    borderColor: t.color.border.default,
  },
  retryBtnText: {
    color: t.color.accent.strong,
    fontSize: 14,
    fontWeight: "600",
  },
  resultsHeader: {
    paddingHorizontal: t.space._5,
    paddingVertical: t.space._2,
  },
  resultsCount: {
    ...t.font.label,
  },
  listContent: {
    paddingBottom: 32,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: t.space._4,
    paddingVertical: t.space._3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.color.border.subtle,
  },
  resultRowPressed: {
    backgroundColor: t.color.bg.raised,
  },
  cover: {
    width: 52,
    height: 78,
    borderRadius: t.radius.lg,
    backgroundColor: t.color.bg.overlay,
  },
  coverPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: t.color.border.default,
  },
  coverPlaceholderText: {
    fontSize: 22,
  },
  resultInfo: {
    flex: 1,
    marginLeft: t.space._4,
    marginRight: t.space._2,
  },
  bookTitle: {
    ...t.font.headline,
    lineHeight: 20,
  },
  bookAuthor: {
    ...t.font.body,
    color: t.color.text.muted,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: "row",
    marginTop: 3,
  },
  metaText: {
    ...t.font.caption,
    color: t.color.text.tertiary,
  },
  resultActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space._2,
  },
  addBtn: {
    backgroundColor: t.color.accent.base,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnDone: {
    backgroundColor: t.color.bg.overlay,
    borderWidth: 1,
    borderColor: t.color.border.default,
  },
  addBtnText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  addBtnTextDone: {
    color: t.color.text.tertiary,
    fontSize: 14,
  },
  chevron: {
    color: t.color.text.faint,
    fontSize: 22,
    fontWeight: "300",
  },
});

/* ── Modal Styles ───────────────────────────────────── */

const m = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.color.bg.base,
  },
  handleWrap: {
    alignItems: "center",
    paddingTop: t.space._3,
    paddingBottom: t.space._1,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: t.color.border.default,
  },
  closeBtn: {
    position: "absolute",
    top: 12,
    right: t.space._4,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: t.color.bg.overlay,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    color: t.color.text.secondary,
    fontSize: 13,
    fontWeight: "700",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  coverWrap: {
    alignItems: "center",
    paddingTop: t.space._5,
    paddingBottom: t.space._5,
  },
  cover: {
    width: 160,
    height: 240,
    borderRadius: t.radius.xl,
    backgroundColor: t.color.bg.overlay,
  },
  coverPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: t.color.border.default,
  },
  coverPlaceholderText: {
    fontSize: 48,
  },
  title: {
    ...t.font.display,
    textAlign: "center",
    paddingHorizontal: t.space._6,
    lineHeight: 34,
  },
  authors: {
    ...t.font.body,
    color: t.color.text.muted,
    textAlign: "center",
    marginTop: t.space._2,
    paddingHorizontal: t.space._6,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    paddingHorizontal: t.space._6,
    marginTop: t.space._4,
    gap: t.space._2,
  },
  pill: {
    backgroundColor: t.color.bg.raised,
    borderRadius: t.radius.md,
    paddingHorizontal: t.space._3,
    paddingVertical: t.space._2,
    borderWidth: 1,
    borderColor: t.color.border.default,
  },
  pillText: {
    ...t.font.caption,
    color: t.color.text.secondary,
  },
  categoriesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    paddingHorizontal: t.space._6,
    marginTop: t.space._3,
    gap: t.space._2,
  },
  categoryPill: {
    backgroundColor: t.color.accent.bg,
    borderRadius: t.radius.sm,
    paddingHorizontal: t.space._3,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: t.color.accent.border,
  },
  categoryText: {
    ...t.font.caption,
    color: t.color.accent.strong,
  },
  isbn: {
    ...t.font.caption,
    color: t.color.text.tertiary,
    textAlign: "center",
    marginTop: t.space._3,
  },
  synopsisSection: {
    paddingHorizontal: t.space._6,
    marginTop: t.space._6,
  },
  synopsisLabel: {
    ...t.font.title,
    marginBottom: t.space._3,
  },
  synopsisText: {
    ...t.font.body,
    color: t.color.text.secondary,
    lineHeight: 24,
  },
  noSynopsis: {
    ...t.font.body,
    color: t.color.text.tertiary,
    fontStyle: "italic",
  },
  descLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space._3,
  },
  descLoadingText: {
    ...t.font.body,
    color: t.color.text.tertiary,
  },
  bottomBar: {
    paddingHorizontal: t.space._5,
    paddingVertical: t.space._4,
    borderTopWidth: 1,
    borderTopColor: t.color.border.subtle,
    backgroundColor: t.color.bg.base,
  },
  addLibraryBtn: {
    backgroundColor: t.color.accent.base,
    borderRadius: t.radius["2xl"],
    paddingVertical: t.space._4,
    alignItems: "center",
  },
  addLibraryBtnDone: {
    backgroundColor: t.color.bg.raised,
    borderWidth: 1,
    borderColor: t.color.border.default,
  },
  addLibraryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  addLibraryBtnTextDone: {
    color: t.color.text.tertiary,
  },
});
