import { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import {
  useLibraryStore,
  type BookWithEntry,
  type BookStatus,
} from "@/store/libraryStore";
import { getOne } from "@/db/database";

const PLACEHOLDER_COVER = "https://via.placeholder.com/128x192.png?text=No+Cover";

interface ProgressRow {
  current_page: number;
  percentage: number;
}

const SECTIONS: { key: BookStatus; title: string }[] = [
  { key: "reading", title: "Reading" },
  { key: "want_to_read", title: "Want to Read" },
  { key: "finished", title: "Finished" },
  { key: "dnf", title: "Did Not Finish" },
];

function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <Text className="text-amber-400 text-xs mt-1">
      {"★".repeat(full)}
      {"☆".repeat(5 - full)}
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

  if (!progress || progress.percentage === 0) return null;

  return (
    <View className="mt-1.5 w-full">
      <View className="h-1 w-full rounded-full bg-neutral-700">
        <View
          className="h-1 rounded-full bg-indigo-500"
          style={{ width: `${Math.min(progress.percentage, 100)}%` }}
        />
      </View>
      <Text className="text-neutral-500 text-[10px] mt-0.5">
        {Math.round(progress.percentage)}%
      </Text>
    </View>
  );
}

function BookCard({ book }: { book: BookWithEntry }) {
  const { entry } = book;

  return (
    <Pressable className="w-28 mr-3 active:opacity-80">
      <Image
        source={{ uri: book.cover_url ?? PLACEHOLDER_COVER }}
        className="w-28 h-40 rounded-lg bg-neutral-800"
        contentFit="cover"
      />

      <Text className="text-white text-xs font-semibold mt-1.5" numberOfLines={2}>
        {book.title}
      </Text>

      <Text className="text-neutral-400 text-[11px] mt-0.5" numberOfLines={1}>
        {book.authors ?? "Unknown author"}
      </Text>

      {entry.status === "reading" && <ProgressBar bookId={book.id} />}

      {entry.status === "finished" && entry.rating != null && (
        <Stars rating={entry.rating} />
      )}
    </Pressable>
  );
}

function LibrarySection({
  title,
  books,
}: {
  title: string;
  books: BookWithEntry[];
}) {
  if (books.length === 0) return null;

  return (
    <View className="mt-6">
      <View className="flex-row items-center justify-between px-4 mb-3">
        <Text className="text-white text-lg font-bold">{title}</Text>
        <Text className="text-neutral-500 text-sm">{books.length}</Text>
      </View>

      <FlatList
        data={books}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <BookCard book={item} />}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="px-4"
      />
    </View>
  );
}

export default function LibraryScreen() {
  const { books, isLoading, loadLibrary } = useLibraryStore();

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

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadLibrary();
    setRefreshing(false);
  }, [loadLibrary]);

  const isEmpty = books.length === 0 && !isLoading;

  return (
    <ScrollView
      className="flex-1 bg-neutral-950"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#6366f1"
        />
      }
    >
      <View className="px-4 pt-4">
        <Text className="text-white text-2xl font-bold">My Library</Text>
        <Text className="text-neutral-500 text-sm mt-1">
          {books.length} {books.length === 1 ? "book" : "books"}
        </Text>
      </View>

      {isLoading && books.length === 0 && (
        <View className="py-16 items-center">
          <ActivityIndicator color="#6366f1" size="small" />
        </View>
      )}

      {isEmpty && (
        <View className="py-16 items-center px-8">
          <Text className="text-neutral-400 text-base text-center">
            Your library is empty.{"\n"}Search for books to start building your collection.
          </Text>
        </View>
      )}

      {SECTIONS.map((section) => (
        <LibrarySection
          key={section.key}
          title={section.title}
          books={grouped.get(section.key) ?? []}
        />
      ))}

      <View className="h-8" />
    </ScrollView>
  );
}
