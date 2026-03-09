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
} from "react-native";
import { Image } from "expo-image";
import { searchBooks, type GoogleBook } from "@/services/googleBooks";
import { useLibraryStore } from "@/store/libraryStore";

const DEBOUNCE_MS = 800;

function BookResult({
  item,
  added,
  onAdd,
}: {
  item: GoogleBook;
  added: boolean;
  onAdd: () => void;
}) {
  return (
    <View style={styles.resultRow}>
      {item.cover ? (
        <Image
          source={{ uri: item.cover }}
          style={styles.cover}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.cover, styles.coverPlaceholder]}>
          <Text style={styles.coverPlaceholderText}>📖</Text>
        </View>
      )}

      <View style={styles.resultInfo}>
        <Text style={styles.bookTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.bookAuthor} numberOfLines={1}>
          {item.authors.length > 0 ? item.authors.join(", ") : "Unknown author"}
        </Text>
        <View style={styles.metaRow}>
          {item.publishedYear != null && (
            <Text style={styles.metaText}>{item.publishedYear}</Text>
          )}
          {item.pageCount != null && (
            <Text style={styles.metaText}>
              {item.publishedYear != null ? " · " : ""}
              {item.pageCount} pages
            </Text>
          )}
        </View>
      </View>

      <Pressable
        onPress={onAdd}
        disabled={added}
        style={[styles.addBtn, added && styles.addBtnDone]}
      >
        <Text style={[styles.addBtnText, added && styles.addBtnTextDone]}>
          {added ? "✓ Added" : "+ Add"}
        </Text>
      </Pressable>
    </View>
  );
}

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GoogleBook[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [hasSearched, setHasSearched] = useState(false);

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
      if (text.trim().length > 0) {
        timerRef.current = setTimeout(() => runSearch(text), DEBOUNCE_MS);
      } else {
        setResults([]);
        setHasSearched(false);
      }
    },
    [runSearch]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
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
            Find books by title, author, or ISBN
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
            onAdd={() => handleAdd(item)}
          />
        )}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

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
  addBtn: {
    backgroundColor: "#4f46e5",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addBtnDone: {
    backgroundColor: "#1c1c1e",
    borderWidth: 1,
    borderColor: "#2c2c2e",
  },
  addBtnText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  addBtnTextDone: {
    color: "#6b7280",
  },
});
