import { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { Image } from "expo-image";
import { searchBooks, type GoogleBook } from "@/services/googleBooks";
import { useLibraryStore } from "@/store/libraryStore";

const DEBOUNCE_MS = 400;
const PLACEHOLDER_COVER = "https://via.placeholder.com/128x192.png?text=No+Cover";

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GoogleBook[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const addBook = useLibraryStore((s) => s.addBook);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const data = await searchBooks(trimmed);
      setResults(data);
    } catch {
      setError("Search failed. Check your connection and try again.");
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleChangeText = useCallback(
    (text: string) => {
      setQuery(text);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => runSearch(text), DEBOUNCE_MS);
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
        /* silently handle duplicates */
      }
    },
    [addBook]
  );

  const renderItem = useCallback(
    ({ item }: { item: GoogleBook }) => {
      const added = addedIds.has(item.id);

      return (
        <View className="flex-row items-center px-4 py-3 border-b border-neutral-800">
          <Image
            source={{ uri: item.cover ?? PLACEHOLDER_COVER }}
            className="w-12 h-[72px] rounded-md bg-neutral-800"
            contentFit="cover"
          />

          <View className="flex-1 ml-3 mr-2">
            <Text className="text-white text-base font-semibold" numberOfLines={2}>
              {item.title}
            </Text>
            <Text className="text-neutral-400 text-sm mt-0.5" numberOfLines={1}>
              {item.authors.length > 0 ? item.authors.join(", ") : "Unknown author"}
            </Text>
            {item.publishedYear && (
              <Text className="text-neutral-500 text-xs mt-0.5">
                {item.publishedYear}
              </Text>
            )}
          </View>

          <Pressable
            onPress={() => handleAdd(item)}
            disabled={added}
            className={`px-3 py-2 rounded-lg ${
              added ? "bg-neutral-700" : "bg-indigo-600 active:bg-indigo-700"
            }`}
          >
            <Text className={`text-sm font-medium ${added ? "text-neutral-400" : "text-white"}`}>
              {added ? "Added" : "Add"}
            </Text>
          </Pressable>
        </View>
      );
    },
    [addedIds, handleAdd]
  );

  return (
    <View className="flex-1 bg-neutral-950">
      <View className="px-4 pt-4 pb-2">
        <View className="flex-row items-center bg-neutral-800 rounded-xl px-4 py-3">
          <Text className="text-neutral-500 mr-2 text-base">🔍</Text>
          <TextInput
            className="flex-1 text-white text-base"
            placeholder="Search books..."
            placeholderTextColor="#737373"
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
              }}
              className="ml-2"
            >
              <Text className="text-neutral-400 text-base">✕</Text>
            </Pressable>
          )}
        </View>
      </View>

      {isSearching && (
        <View className="py-8 items-center">
          <ActivityIndicator color="#6366f1" size="small" />
          <Text className="text-neutral-500 text-sm mt-2">Searching...</Text>
        </View>
      )}

      {error && (
        <View className="px-4 py-8 items-center">
          <Text className="text-red-400 text-sm text-center">{error}</Text>
        </View>
      )}

      {!isSearching && !error && query.length > 0 && results.length === 0 && (
        <View className="px-4 py-8 items-center">
          <Text className="text-neutral-500 text-sm">No results found</Text>
        </View>
      )}

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="pb-8"
      />
    </View>
  );
}
