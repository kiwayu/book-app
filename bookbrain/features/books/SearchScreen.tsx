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

const DEBOUNCE_MS = 800;

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
  const [description, setDescription] = useState<string | null>(null);
  const [loadingDesc, setLoadingDesc] = useState(false);

  useEffect(() => {
    if (!book || !visible) {
      setDescription(null);
      return;
    }

    if (book.description) {
      setDescription(book.description);
      return;
    }

    let cancelled = false;
    setLoadingDesc(true);
    fetchBookDescription(book.id).then((desc) => {
      if (!cancelled) {
        setDescription(desc);
        setLoadingDesc(false);
      }
    });
    return () => { cancelled = true; };
  }, [book, visible]);

  if (!book) return null;

  const desc = description ?? book.description;
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
      <View style={modalStyles.container}>
        {/* Close handle */}
        <View style={modalStyles.handleWrap}>
          <View style={modalStyles.handle} />
        </View>

        {/* Close button */}
        <Pressable style={modalStyles.closeBtn} onPress={onClose}>
          <Text style={modalStyles.closeBtnText}>✕</Text>
        </Pressable>

        <ScrollView
          style={modalStyles.scroll}
          contentContainerStyle={modalStyles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Cover */}
          <View style={modalStyles.coverWrap}>
            {book.coverLarge || book.cover ? (
              <Image
                source={{ uri: book.coverLarge ?? book.cover ?? undefined }}
                style={modalStyles.cover}
                contentFit="cover"
              />
            ) : (
              <View style={[modalStyles.cover, modalStyles.coverPlaceholder]}>
                <Text style={modalStyles.coverPlaceholderText}>📖</Text>
              </View>
            )}
          </View>

          {/* Title & Author */}
          <Text style={modalStyles.title}>{book.title}</Text>
          <Text style={modalStyles.authors}>
            {book.authors.length > 0 ? book.authors.join(", ") : "Unknown author"}
          </Text>

          {/* Meta pills */}
          <View style={modalStyles.metaRow}>
            {book.publishedYear != null && (
              <View style={modalStyles.pill}>
                <Text style={modalStyles.pillText}>{book.publishedYear}</Text>
              </View>
            )}
            {book.pageCount != null && (
              <View style={modalStyles.pill}>
                <Text style={modalStyles.pillText}>{book.pageCount} pages</Text>
              </View>
            )}
            {book.publisher && (
              <View style={modalStyles.pill}>
                <Text style={modalStyles.pillText}>{book.publisher}</Text>
              </View>
            )}
          </View>

          {/* Categories */}
          {book.categories.length > 0 && (
            <View style={modalStyles.categoriesRow}>
              {book.categories.slice(0, 4).map((cat, i) => (
                <View key={i} style={modalStyles.categoryPill}>
                  <Text style={modalStyles.categoryText}>{cat}</Text>
                </View>
              ))}
            </View>
          )}

          {/* ISBN */}
          {book.isbn && (
            <Text style={modalStyles.isbn}>ISBN: {book.isbn}</Text>
          )}

          {/* Synopsis */}
          <View style={modalStyles.synopsisSection}>
            <Text style={modalStyles.synopsisLabel}>Synopsis</Text>
            {loadingDesc && !plainDesc && (
              <View style={modalStyles.descLoading}>
                <ActivityIndicator color="#818cf8" size="small" />
                <Text style={modalStyles.descLoadingText}>Loading synopsis...</Text>
              </View>
            )}
            {plainDesc ? (
              <Text style={modalStyles.synopsisText}>{plainDesc}</Text>
            ) : !loadingDesc ? (
              <Text style={modalStyles.noSynopsis}>No synopsis available for this book.</Text>
            ) : null}
          </View>
        </ScrollView>

        {/* Bottom action */}
        <View style={modalStyles.bottomBar}>
          <Pressable
            style={[modalStyles.addLibraryBtn, added && modalStyles.addLibraryBtnDone]}
            onPress={onAdd}
            disabled={added}
          >
            <Text style={[modalStyles.addLibraryBtnText, added && modalStyles.addLibraryBtnTextDone]}>
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
    <Pressable style={styles.resultRow} onPress={onPress}>
      {item.cover ? (
        <Image source={{ uri: item.cover }} style={styles.cover} contentFit="cover" />
      ) : (
        <View style={[styles.cover, styles.coverPlaceholder]}>
          <Text style={styles.coverPlaceholderText}>📖</Text>
        </View>
      )}

      <View style={styles.resultInfo}>
        <Text style={styles.bookTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.bookAuthor} numberOfLines={1}>
          {item.authors.length > 0 ? item.authors.join(", ") : "Unknown author"}
        </Text>
        <View style={styles.metaRow}>
          {item.publishedYear != null && (
            <Text style={styles.metaText}>{item.publishedYear}</Text>
          )}
          {item.pageCount != null && (
            <Text style={styles.metaText}>
              {item.publishedYear != null ? " · " : ""}{item.pageCount} pages
            </Text>
          )}
        </View>
      </View>

      <View style={styles.resultActions}>
        <Pressable
          onPress={(e) => { e.stopPropagation(); onAdd(); }}
          disabled={added}
          style={[styles.addBtn, added && styles.addBtnDone]}
        >
          <Text style={[styles.addBtnText, added && styles.addBtnTextDone]}>
            {added ? "✓" : "+"}
          </Text>
        </Pressable>
        <Text style={styles.chevron}>›</Text>
      </View>
    </Pressable>
  );
}

/* ── Search Screen ──────────────────────────────────── */

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GoogleBook[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedBook, setSelectedBook] = useState<GoogleBook | null>(null);

  const addBook = useLibraryStore((s) => s.addBook);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setResults([]);
      setIsSearching(false);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setError(null);
    setHasSearched(true);

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
        setResults([]);
        setHasSearched(false);
        setError(null);
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
      } catch {
        /* duplicate */
      }
    },
    [addBook]
  );

  const showEmpty = hasSearched && !isSearching && !error && results.length === 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Search</Text>
        <Text style={styles.headerSub}>Find your next read</Text>
      </View>

      {/* Search bar */}
      <View style={styles.searchBarWrap}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Title, author, or ISBN..."
            placeholderTextColor="#6b7280"
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
              onPress={() => {
                setQuery("");
                setResults([]);
                setError(null);
                setHasSearched(false);
              }}
              style={styles.clearBtn}
            >
              <Text style={styles.clearBtnText}>✕</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Loading */}
      {isSearching && (
        <View style={styles.centerState}>
          <ActivityIndicator color="#818cf8" size="large" />
          <Text style={styles.stateText}>Searching...</Text>
        </View>
      )}

      {/* Error */}
      {error && (
        <View style={styles.centerState}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => runSearch(query)}>
            <Text style={styles.retryBtnText}>Try again</Text>
          </Pressable>
        </View>
      )}

      {/* Empty */}
      {showEmpty && (
        <View style={styles.centerState}>
          <Text style={styles.emptyEmoji}>📚</Text>
          <Text style={styles.stateText}>No books found</Text>
          <Text style={styles.stateSubtext}>Try a different search term</Text>
        </View>
      )}

      {/* Idle state */}
      {!hasSearched && !isSearching && results.length === 0 && (
        <View style={styles.centerState}>
          <Text style={styles.emptyEmoji}>🔎</Text>
          <Text style={styles.stateText}>Search for books</Text>
          <Text style={styles.stateSubtext}>
            Tap a result to see full details and synopsis
          </Text>
        </View>
      )}

      {/* Results count */}
      {results.length > 0 && !isSearching && (
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsCount}>
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
        contentContainerStyle={styles.listContent}
      />

      {/* Book Detail Modal */}
      <BookDetailModal
        book={selectedBook}
        visible={selectedBook !== null}
        added={selectedBook ? addedIds.has(selectedBook.id) : false}
        onClose={() => setSelectedBook(null)}
        onAdd={() => {
          if (selectedBook) handleAdd(selectedBook);
        }}
      />
    </View>
  );
}

/* ── Search Screen Styles ───────────────────────────── */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  headerTitle: {
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "800",
  },
  headerSub: {
    color: "#9ca3af",
    fontSize: 15,
    marginTop: 2,
  },
  searchBarWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1c1c1e",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#2c2c2e",
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: "#ffffff",
    fontSize: 16,
  },
  clearBtn: {
    marginLeft: 8,
    padding: 4,
  },
  clearBtnText: {
    color: "#9ca3af",
    fontSize: 16,
    fontWeight: "600",
  },
  centerState: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  stateText: {
    color: "#9ca3af",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 12,
  },
  stateSubtext: {
    color: "#6b7280",
    fontSize: 14,
    marginTop: 4,
  },
  emptyEmoji: {
    fontSize: 40,
  },
  errorEmoji: {
    fontSize: 36,
  },
  errorText: {
    color: "#f87171",
    fontSize: 15,
    fontWeight: "600",
    marginTop: 12,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 16,
    backgroundColor: "#1c1c1e",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2c2c2e",
  },
  retryBtnText: {
    color: "#818cf8",
    fontSize: 14,
    fontWeight: "600",
  },
  resultsHeader: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  resultsCount: {
    color: "#6b7280",
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  listContent: {
    paddingBottom: 32,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1c1c1e",
  },
  cover: {
    width: 50,
    height: 75,
    borderRadius: 6,
    backgroundColor: "#1c1c1e",
  },
  coverPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#2c2c2e",
  },
  coverPlaceholderText: {
    fontSize: 22,
  },
  resultInfo: {
    flex: 1,
    marginLeft: 14,
    marginRight: 10,
  },
  bookTitle: {
    color: "#f3f4f6",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  bookAuthor: {
    color: "#9ca3af",
    fontSize: 13,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: "row",
    marginTop: 3,
  },
  metaText: {
    color: "#6b7280",
    fontSize: 12,
  },
  resultActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  addBtn: {
    backgroundColor: "#4f46e5",
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnDone: {
    backgroundColor: "#1c1c1e",
    borderWidth: 1,
    borderColor: "#2c2c2e",
  },
  addBtnText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
  },
  addBtnTextDone: {
    color: "#6b7280",
    fontSize: 14,
  },
  chevron: {
    color: "#4b5563",
    fontSize: 22,
    fontWeight: "300",
  },
});

/* ── Modal Styles ───────────────────────────────────── */

const modalStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  handleWrap: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#3f3f46",
  },
  closeBtn: {
    position: "absolute",
    top: 12,
    right: 16,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#1c1c1e",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    color: "#9ca3af",
    fontSize: 14,
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
    paddingTop: 20,
    paddingBottom: 20,
  },
  cover: {
    width: 160,
    height: 240,
    borderRadius: 10,
    backgroundColor: "#1c1c1e",
  },
  coverPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#2c2c2e",
  },
  coverPlaceholderText: {
    fontSize: 48,
  },
  title: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    paddingHorizontal: 24,
    lineHeight: 28,
  },
  authors: {
    color: "#9ca3af",
    fontSize: 15,
    textAlign: "center",
    marginTop: 6,
    paddingHorizontal: 24,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    paddingHorizontal: 24,
    marginTop: 14,
    gap: 8,
  },
  pill: {
    backgroundColor: "#1c1c1e",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#2c2c2e",
  },
  pillText: {
    color: "#d1d5db",
    fontSize: 13,
    fontWeight: "600",
  },
  categoriesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    paddingHorizontal: 24,
    marginTop: 10,
    gap: 6,
  },
  categoryPill: {
    backgroundColor: "rgba(79, 70, 229, 0.15)",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  categoryText: {
    color: "#a5b4fc",
    fontSize: 12,
    fontWeight: "600",
  },
  isbn: {
    color: "#6b7280",
    fontSize: 12,
    textAlign: "center",
    marginTop: 10,
  },
  synopsisSection: {
    paddingHorizontal: 24,
    marginTop: 24,
  },
  synopsisLabel: {
    color: "#f3f4f6",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
  },
  synopsisText: {
    color: "#d1d5db",
    fontSize: 15,
    lineHeight: 24,
  },
  noSynopsis: {
    color: "#6b7280",
    fontSize: 14,
    fontStyle: "italic",
  },
  descLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  descLoadingText: {
    color: "#6b7280",
    fontSize: 14,
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#1c1c1e",
    backgroundColor: "#0a0a0a",
  },
  addLibraryBtn: {
    backgroundColor: "#4f46e5",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  addLibraryBtnDone: {
    backgroundColor: "#1c1c1e",
    borderWidth: 1,
    borderColor: "#2c2c2e",
  },
  addLibraryBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  addLibraryBtnTextDone: {
    color: "#6b7280",
  },
});
