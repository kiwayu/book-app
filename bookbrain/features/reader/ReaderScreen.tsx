import { useState, useRef, useCallback, useEffect } from "react";
import { View, Text, Pressable, SafeAreaView } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { buildReaderHtml, type ReaderTheme } from "./readerHtml";
import { execute, getOne } from "@/db/database";

interface TocItem {
  id: string;
  label: string;
  href: string;
  index: number;
}

interface ReaderScreenProps {
  bookId: number;
  epubUrl: string;
  onClose?: () => void;
}

interface SavedProgress {
  current_page: number;
  percentage: number;
  cfi: string | null;
}

const FONT_SIZES = [14, 16, 18, 20, 22, 24];
const THEME_CYCLE: ReaderTheme[] = ["dark", "light", "sepia"];
const THEME_LABELS: Record<ReaderTheme, string> = {
  dark: "Dark",
  light: "Light",
  sepia: "Sepia",
};
const THEME_BG: Record<ReaderTheme, string> = {
  dark: "bg-neutral-900",
  light: "bg-white",
  sepia: "bg-[#f4ecd8]",
};
const THEME_FG: Record<ReaderTheme, string> = {
  dark: "text-neutral-200",
  light: "text-neutral-900",
  sepia: "text-[#5b4636]",
};

const SAVE_DEBOUNCE_MS = 2000;

export default function ReaderScreen({
  bookId,
  epubUrl,
  onClose,
}: ReaderScreenProps) {
  const webViewRef = useRef<WebView>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef<number | null>(null);
  const sessionStartRef = useRef<string>(new Date().toISOString());
  const startPageRef = useRef<number>(0);

  const [theme, setTheme] = useState<ReaderTheme>("dark");
  const [fontSizeIndex, setFontSizeIndex] = useState(1);
  const [showControls, setShowControls] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [chapter, setChapter] = useState("");
  const [percentage, setPercentage] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [savedCfi, setSavedCfi] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    (async () => {
      const row = await getOne<SavedProgress>(
        "SELECT current_page, percentage, cfi FROM reading_progress WHERE book_id = ?",
        [bookId]
      );
      if (row) {
        setSavedCfi(row.cfi);
        setCurrentPage(row.current_page);
        setPercentage(row.percentage);
      }
    })();
  }, [bookId]);

  useEffect(() => {
    (async () => {
      const result = await execute(
        "INSERT INTO reading_sessions (book_id, start_time, pages_read) VALUES (?, ?, 0)",
        [bookId, sessionStartRef.current]
      );
      sessionIdRef.current = result.lastInsertRowId;
    })();

    return () => {
      const sid = sessionIdRef.current;
      if (sid) {
        execute(
          "UPDATE reading_sessions SET end_time = ? WHERE id = ?",
          [new Date().toISOString(), sid]
        );
      }
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [bookId]);

  const saveProgress = useCallback(
    (cfi: string, pct: number, page: number) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

      saveTimerRef.current = setTimeout(async () => {
        const now = new Date().toISOString();

        await execute(
          `INSERT INTO reading_progress (book_id, current_page, percentage, last_opened, cfi)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(book_id) DO UPDATE SET
             current_page = excluded.current_page,
             percentage   = excluded.percentage,
             last_opened  = excluded.last_opened,
             cfi          = excluded.cfi`,
          [bookId, page, pct, now, cfi]
        );

        const pagesRead = Math.max(0, page - startPageRef.current);
        if (sessionIdRef.current && pagesRead > 0) {
          await execute(
            "UPDATE reading_sessions SET pages_read = ?, end_time = ? WHERE id = ?",
            [pagesRead, now, sessionIdRef.current]
          );
        }
      }, SAVE_DEBOUNCE_MS);
    },
    [bookId]
  );

  const inject = useCallback(
    (js: string) => webViewRef.current?.injectJavaScript(js + ";true;"),
    []
  );

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);

        switch (msg.type) {
          case "ready":
            setIsReady(true);
            break;

          case "tocLoaded":
            setToc(msg.toc ?? []);
            break;

          case "locationsGenerated":
            setTotalPages(msg.totalPages ?? 0);
            break;

          case "locationChanged":
            setPercentage(msg.percentage ?? 0);
            setCurrentPage(msg.currentPage ?? 0);
            setChapter(msg.chapter ?? "");
            if (startPageRef.current === 0 && msg.currentPage > 0) {
              startPageRef.current = msg.currentPage;
            }
            if (msg.cfi) {
              saveProgress(msg.cfi, msg.percentage ?? 0, msg.currentPage ?? 0);
            }
            break;

          case "error":
            console.warn("Reader error:", msg.message);
            break;
        }
      } catch {
        /* malformed message */
      }
    },
    [saveProgress]
  );

  const nextPage = useCallback(
    () => inject("window.readerApi.nextPage()"),
    [inject]
  );
  const prevPage = useCallback(
    () => inject("window.readerApi.prevPage()"),
    [inject]
  );

  const cycleFontSize = useCallback(
    (direction: 1 | -1) => {
      setFontSizeIndex((prev) => {
        const next = Math.max(0, Math.min(FONT_SIZES.length - 1, prev + direction));
        inject(`window.readerApi.setFontSize(${FONT_SIZES[next]})`);
        return next;
      });
    },
    [inject]
  );

  const cycleTheme = useCallback(() => {
    setTheme((prev) => {
      const idx = THEME_CYCLE.indexOf(prev);
      const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
      inject(`window.readerApi.setTheme("${next}")`);
      return next;
    });
  }, [inject]);

  const goToChapter = useCallback(
    (href: string) => {
      inject(`window.readerApi.goToChapter("${href}")`);
      setShowToc(false);
    },
    [inject]
  );

  const html = buildReaderHtml(
    epubUrl,
    savedCfi,
    FONT_SIZES[fontSizeIndex],
    theme
  );

  const bgClass = THEME_BG[theme];
  const fgClass = THEME_FG[theme];
  const barBg = theme === "dark" ? "bg-neutral-900/95" : theme === "sepia" ? "bg-[#ede2cc]/95" : "bg-white/95";

  return (
    <View className="flex-1 bg-black">
      <WebView
        ref={webViewRef}
        source={{ html }}
        originWhitelist={["*"]}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
        className="flex-1"
      />

      {/* Tap zones for page navigation */}
      <View className="absolute inset-0 flex-row" pointerEvents="box-none">
        <Pressable className="flex-1" onPress={prevPage} />
        <Pressable
          className="flex-[2]"
          onPress={() => setShowControls((v) => !v)}
        />
        <Pressable className="flex-1" onPress={nextPage} />
      </View>

      {/* Top bar */}
      {showControls && (
        <SafeAreaView className={`absolute top-0 left-0 right-0 ${barBg}`}>
          <View className="flex-row items-center justify-between px-4 py-3">
            <Pressable onPress={onClose} className="py-1">
              <Text className={`${fgClass} text-base font-medium`}>← Back</Text>
            </Pressable>

            <Text className={`${fgClass} text-sm flex-1 text-center mx-2`} numberOfLines={1}>
              {chapter || "Loading..."}
            </Text>

            <Pressable onPress={() => setShowToc(true)} className="py-1">
              <Text className={`${fgClass} text-base font-medium`}>☰</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      )}

      {/* Bottom bar */}
      {showControls && (
        <SafeAreaView className={`absolute bottom-0 left-0 right-0 ${barBg}`}>
          {/* Progress bar */}
          <View className="px-4 pt-3">
            <View className="h-1 w-full rounded-full bg-neutral-700">
              <View
                className="h-1 rounded-full bg-indigo-500"
                style={{ width: `${Math.min(percentage, 100)}%` }}
              />
            </View>
            <View className="flex-row justify-between mt-1">
              <Text className={`${fgClass} text-xs opacity-60`}>
                {currentPage}/{totalPages || "—"}
              </Text>
              <Text className={`${fgClass} text-xs opacity-60`}>
                {percentage.toFixed(1)}%
              </Text>
            </View>
          </View>

          {/* Controls */}
          <View className="flex-row items-center justify-around px-4 py-3">
            <Pressable
              onPress={() => cycleFontSize(-1)}
              disabled={fontSizeIndex === 0}
              className="px-3 py-2"
            >
              <Text className={`${fgClass} text-base ${fontSizeIndex === 0 ? "opacity-30" : ""}`}>
                A-
              </Text>
            </Pressable>

            <Text className={`${fgClass} text-sm`}>
              {FONT_SIZES[fontSizeIndex]}px
            </Text>

            <Pressable
              onPress={() => cycleFontSize(1)}
              disabled={fontSizeIndex === FONT_SIZES.length - 1}
              className="px-3 py-2"
            >
              <Text
                className={`${fgClass} text-lg ${
                  fontSizeIndex === FONT_SIZES.length - 1 ? "opacity-30" : ""
                }`}
              >
                A+
              </Text>
            </Pressable>

            <View className="w-px h-5 bg-neutral-600" />

            <Pressable onPress={cycleTheme} className="px-3 py-2">
              <Text className={`${fgClass} text-sm font-medium`}>
                {THEME_LABELS[theme]}
              </Text>
            </Pressable>

            <View className="w-px h-5 bg-neutral-600" />

            <Pressable onPress={prevPage} className="px-3 py-2">
              <Text className={`${fgClass} text-base`}>‹</Text>
            </Pressable>

            <Pressable onPress={nextPage} className="px-3 py-2">
              <Text className={`${fgClass} text-base`}>›</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      )}

      {/* Table of Contents overlay */}
      {showToc && (
        <View className="absolute inset-0 bg-black/80">
          <SafeAreaView className="flex-1">
            <View className={`flex-1 m-4 rounded-2xl ${bgClass} overflow-hidden`}>
              <View className="flex-row items-center justify-between px-4 py-3 border-b border-neutral-700">
                <Text className={`${fgClass} text-lg font-bold`}>Contents</Text>
                <Pressable onPress={() => setShowToc(false)} className="p-2">
                  <Text className={`${fgClass} text-base`}>✕</Text>
                </Pressable>
              </View>

              {toc.length === 0 ? (
                <View className="flex-1 items-center justify-center">
                  <Text className={`${fgClass} opacity-50 text-sm`}>
                    No table of contents available
                  </Text>
                </View>
              ) : (
                <View className="flex-1">
                  {toc.map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => goToChapter(item.href)}
                      className="px-4 py-3 border-b border-neutral-800 active:opacity-60"
                    >
                      <Text className={`${fgClass} text-sm`} numberOfLines={1}>
                        {item.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </SafeAreaView>
        </View>
      )}
    </View>
  );
}
