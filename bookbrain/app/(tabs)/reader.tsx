import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useLibraryStore } from "@/store/libraryStore";
import { getEpubPath, setEpubPath, removeEpubPath } from "@/services/epubPaths";
import ReaderScreen from "@/features/reader/ReaderScreen";
import { t } from "@/theme";

export default function ReaderTab() {
  const currentBook = useLibraryStore((s) => s.currentBook);
  const router      = useRouter();

  const [epubUrl,   setEpubUrl]   = useState<string | null>(null);
  const [urlInput,  setUrlInput]  = useState("");
  const [urlError,  setUrlError]  = useState<string | null>(null);

  /* load saved epub path when the selected book changes */
  useEffect(() => {
    if (!currentBook) {
      setEpubUrl(null);
      setUrlInput("");
      return;
    }
    getEpubPath(currentBook.id).then((path) => {
      if (path) {
        setEpubUrl(path);
        setUrlInput(path);
      } else {
        setEpubUrl(null);
        setUrlInput("");
      }
    });
  }, [currentBook?.id]);

  const handleOpen = useCallback(async () => {
    const url = urlInput.trim();
    if (!url) { setUrlError("Please enter an EPUB URL or file path."); return; }
    if (!currentBook) return;
    setUrlError(null);
    await setEpubPath(currentBook.id, url);
    setEpubUrl(url);
  }, [urlInput, currentBook]);

  const handleClose = useCallback(() => {
    setEpubUrl(null);
  }, []);

  const handleRemove = useCallback(async () => {
    if (!currentBook) return;
    await removeEpubPath(currentBook.id);
    setEpubUrl(null);
    setUrlInput("");
  }, [currentBook]);

  /* full-screen reader — takes over the entire tab */
  if (currentBook && epubUrl) {
    return (
      <ReaderScreen
        bookId={currentBook.id}
        epubUrl={epubUrl}
        title={currentBook.title}
        onClose={handleClose}
      />
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={s.kav}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>Reader</Text>
          <Text style={s.headerSub}>
            {currentBook ? "Set an EPUB source to start reading" : "Select a book from your library"}
          </Text>
        </View>

        {currentBook ? (
          <View style={s.content}>
            {/* Book info card */}
            <View style={s.bookCard}>
              <Text style={s.bookTitle} numberOfLines={2}>{currentBook.title}</Text>
              {currentBook.authors ? (
                <Text style={s.bookAuthor} numberOfLines={1}>{currentBook.authors}</Text>
              ) : null}
            </View>

            {/* URL input */}
            <Text style={s.inputLabel}>EPUB URL or file path</Text>
            <View style={s.inputRow}>
              <TextInput
                style={[s.input, urlError && s.inputError]}
                placeholder="https://example.com/book.epub"
                placeholderTextColor={t.color.text.faint}
                value={urlInput}
                onChangeText={(v) => { setUrlInput(v); setUrlError(null); }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={handleOpen}
              />
            </View>
            {urlError ? (
              <Text style={s.errorText}>{urlError}</Text>
            ) : null}

            <Text style={s.hint}>
              Paste a remote URL (https://) or a local file path (file://). The path is saved per book.
            </Text>

            {/* Actions */}
            <Pressable
              style={({ pressed }) => [s.openBtn, pressed && s.openBtnPressed]}
              onPress={handleOpen}
            >
              <Text style={s.openBtnText}>Open Book</Text>
            </Pressable>

            {urlInput.trim().length > 0 && (
              <Pressable
                style={({ pressed }) => [s.removeBtn, pressed && s.removeBtnPressed]}
                onPress={handleRemove}
              >
                <Text style={s.removeBtnText}>Clear Saved EPUB</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>📚</Text>
            <Text style={s.emptyTitle}>No book selected</Text>
            <Text style={s.emptyBody}>
              Open a book from your library to set up reading here.
            </Text>
            <Pressable
              style={({ pressed }) => [s.openBtn, pressed && s.openBtnPressed]}
              onPress={() => router.push("/(tabs)")}
            >
              <Text style={s.openBtnText}>Go to Library</Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: t.color.bg.base,
  },
  kav: {
    flex: 1,
  },
  header: {
    paddingHorizontal: t.space._5,
    paddingTop: t.space._4,
    paddingBottom: t.space._2,
  },
  headerTitle: {
    ...t.font.display,
    marginBottom: 2,
  },
  headerSub: {
    ...t.font.body,
    color: t.color.text.tertiary,
    marginTop: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: t.space._5,
    paddingTop: t.space._4,
  },
  bookCard: {
    backgroundColor: t.color.bg.raised,
    borderRadius: t.radius["3xl"],
    padding: t.space._4,
    marginBottom: t.space._5,
    borderWidth: 1,
    borderColor: t.color.border.subtle,
    ...t.shadow.soft,
  },
  bookTitle: {
    ...t.font.title,
  },
  bookAuthor: {
    ...t.font.body,
    color: t.color.text.tertiary,
    marginTop: t.space._1,
  },
  inputLabel: {
    ...t.font.label,
    marginBottom: t.space._2,
  },
  inputRow: {
    marginBottom: t.space._2,
  },
  input: {
    backgroundColor: t.color.bg.raised,
    borderWidth: 1,
    borderColor: t.color.border.default,
    borderRadius: t.radius["2xl"],
    paddingHorizontal: t.space._4,
    paddingVertical: t.space._3,
    ...t.font.body,
    color: t.color.text.primary,
  },
  inputError: {
    borderColor: t.color.error.base,
  },
  errorText: {
    ...t.font.caption,
    color: t.color.error.base,
    marginBottom: t.space._2,
  },
  hint: {
    ...t.font.caption,
    color: t.color.text.muted,
    lineHeight: 18,
    marginBottom: t.space._5,
  },
  openBtn: {
    backgroundColor: t.color.accent.base,
    borderRadius: t.radius["2xl"],
    paddingVertical: t.space._4,
    alignItems: "center",
    marginBottom: t.space._3,
    ...t.shadow.soft,
  },
  openBtnPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  openBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  removeBtn: {
    borderRadius: t.radius["2xl"],
    paddingVertical: t.space._3,
    alignItems: "center",
    borderWidth: 1,
    borderColor: t.color.border.default,
  },
  removeBtnPressed: {
    opacity: 0.7,
  },
  removeBtnText: {
    ...t.font.body,
    color: t.color.text.tertiary,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: t.space._8,
    paddingBottom: t.space._10,
  },
  emptyIcon: {
    fontSize: 52,
    marginBottom: t.space._4,
  },
  emptyTitle: {
    ...t.font.title,
    marginBottom: t.space._2,
    textAlign: "center",
  },
  emptyBody: {
    ...t.font.body,
    color: t.color.text.tertiary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: t.space._6,
  },
});
