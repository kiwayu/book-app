import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Animated,
  AppState,
  Alert,
  Platform,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import {
  buildReaderHtml,
  DEFAULT_SETTINGS,
  type ReaderSettings,
  type ReaderTheme,
  type ReaderFont,
} from "./readerHtml";
import {
  startSession,
  endSession,
  updateProgress,
  getProgress,
  setRsvpWordIndex,
} from "@/services/readingTracker";
import { loadPrefs, savePrefs } from "@/services/preferences";
import { getSetting } from "@/services/settings";
import RsvpOverlay from "./rsvp/RsvpOverlay";
import { tokenizeParagraphs, type Token } from "./rsvp/engine";
import { tapZone } from "./tapZones";
import {
  addHighlight,
  getHighlightsForBook,
  deleteHighlight,
  HIGHLIGHT_COLORS,
  type Highlight,
} from "@/services/highlights";
import {
  toggleBookmark,
  addBookmark,
  getBookmarksForBook,
  type Bookmark,
} from "@/services/bookmarks";
import { writeReaderHtmlFile, readAccessRoot } from "@/services/localEpub";
import { hasCover, saveCover } from "@/services/epubCover";
import { applyEpubMeta } from "@/services/epubMeta";
import { useLibraryStore } from "@/store/libraryStore";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { t, getThemeId, isThemeDark } from "@/theme";

/* ── Types ──────────────────────────────────────────── */

interface TocItem {
  id: string;
  label: string;
  href: string;
  level: number;
}

interface ReaderScreenProps {
  bookId:  number;
  epubUrl: string;
  title?:  string;
  onClose?: () => void;
}

/* ── Constants ──────────────────────────────────────── */

const FONT_SIZES    = [13, 14, 15, 16, 17, 18, 19, 20, 22, 24, 26];
const LINE_HEIGHTS  = [1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0];
const MARGINS       = [8, 12, 16, 20, 24, 28, 32, 40, 48];
const SAVE_DEBOUNCE = 2000;
const AUTO_HIDE_MS  = 3500;
const SHEET_HEIGHT  = 440;

const THEME_BG: Record<ReaderTheme, string> = {
  light: "#fafafa",
  sepia: "#f4ecd8",
  dark:  "#1c1c1c",
  night: "#000000",
};
const THEME_FG: Record<ReaderTheme, string> = {
  light: "#1a1a1a",
  sepia: "#5b4636",
  dark:  "#d4d4d4",
  night: "#a0a0a0",
};
const THEME_BAR_BG: Record<ReaderTheme, string> = {
  light: "rgba(250,250,250,0.96)",
  sepia: "rgba(237,226,204,0.96)",
  dark:  "rgba(20,20,20,0.97)",
  night: "rgba(0,0,0,0.98)",
};
const THEME_BAR_BORDER: Record<ReaderTheme, string> = {
  light: "rgba(0,0,0,0.08)",
  sepia: "rgba(91,70,54,0.12)",
  dark:  "rgba(255,255,255,0.08)",
  night: "rgba(255,255,255,0.05)",
};
const THEME_SUB: Record<ReaderTheme, string> = {
  light: "#888",
  sepia: "#917562",
  dark:  "#777",
  night: "#555",
};
const THEME_ACCENT: Record<ReaderTheme, string> = {
  light: "#3f82bc",
  sepia: "#8b5e3c",
  dark:  "#88BDF2",
  night: "#6A89A7",
};
const THEME_SWATCHES: Record<ReaderTheme, string> = THEME_BG;
const THEME_LABEL: Record<ReaderTheme, string> = {
  light: "Light",
  sepia: "Sepia",
  dark:  "Dark",
  night: "Night",
};
const FONT_LABEL: Record<ReaderFont, string> = {
  georgia:  "Georgia",
  palatino: "Palatino",
  charter:  "Charter",
  system:   "System",
};

const THEMES_ORDER: ReaderTheme[] = ["light", "sepia", "dark", "night"];
const FONTS_ORDER:  ReaderFont[]  = ["georgia", "palatino", "charter", "system"];

/* ── Reading time helper ────────────────────────────── */

function readingTimeLabel(currentPage: number, totalPages: number): string {
  if (!totalPages || !currentPage) return "";
  const remaining = Math.max(0, totalPages - currentPage);
  const mins = Math.round(remaining * 1.2);
  if (mins < 1) return "< 1 min left";
  if (mins < 60) return `${mins} min left`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m left` : `${h}h left`;
}

/* ── Main component ─────────────────────────────────── */

export default function ReaderScreen({
  bookId,
  epubUrl,
  title,
  onClose,
}: ReaderScreenProps) {
  const webViewRef      = useRef<WebView>(null);
  const saveTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef    = useRef<number | null>(null);
  const startPageRef    = useRef<number>(0);
  const latestPageRef   = useRef<number>(0);
  const htmlRef         = useRef<string | null>(null);
  const coverTriedRef   = useRef(false);
  const rsvpMarkerRef   = useRef(false); // next currentCfi drops a speed-read marker
  const caretStartIdxRef = useRef(0);    // word index chosen via the on-page caret
  const caretTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const caretActiveRef  = useRef(false);
  const caretGrantRef   = useRef<{ x: number; y: number } | null>(null);

  const [htmlReady,     setHtmlReady]     = useState(false);
  /* file:// URI of the written reader HTML when the book is a local file
     (iOS WKWebView cannot XHR file:// from an HTML-string origin — Spike #0) */
  const [sourceUri,     setSourceUri]     = useState<string | null>(null);
  // Reader opens in a theme matching the app mode (dark app → dark pages).
  const [settings,      setSettings]      = useState<ReaderSettings>(
    () => ({ ...DEFAULT_SETTINGS, theme: isThemeDark(getThemeId()) ? "dark" : "light" })
  );
  const [showControls,  setShowControls]  = useState(false);
  const [showSettings,  setShowSettings]  = useState(false);
  const [showToc,       setShowToc]       = useState(false);
  const [toc,           setToc]           = useState<TocItem[]>([]);
  const [chapter,       setChapter]       = useState("");
  const [percentage,    setPercentage]    = useState(0);
  const [currentPage,   setCurrentPage]   = useState(0);
  const [totalPages,    setTotalPages]    = useState(0);
  const [chapterPage,   setChapterPage]   = useState(0);
  const [chapterPages,  setChapterPages]  = useState(0);
  const [highlights,    setHighlights]    = useState<Highlight[]>([]);
  const [bookmarks,     setBookmarks]     = useState<Bookmark[]>([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showHighlights,setShowHighlights]= useState(false);
  const [sessionStartTime] = useState(Date.now());
  const [sessionPages,  setSessionPages]  = useState(0);

  /* ── Seek slider (jump to any page) ── */
  const [seeking,       setSeeking]       = useState(false);
  const [seekPct,       setSeekPct]       = useState(0);
  const seekWidthRef    = useRef(0);

  /* ── RSVP speed reading ── */
  const [showRsvp,      setShowRsvp]      = useState(false);
  const [rsvpTokens,    setRsvpTokens]    = useState<Token[]>([]);
  const [rsvpChapter,   setRsvpChapter]   = useState("");
  const [rsvpWpm,       setRsvpWpm]       = useState(300);
  const rsvpStartIdxRef = useRef(0);
  /* Bumped per chapter load so the overlay remounts: a fresh mount is exactly
     "paused at word 0 of the new chapter" with no extra reset plumbing. */
  const [rsvpEpoch,     setRsvpEpoch]     = useState(0);
  /* Mirrors showRsvp for the message handler and the progress writer, which
     both run outside React's render and would otherwise read a stale value. */
  const showRsvpRef     = useRef(false);
  /* Set when the current tokens arrived from an advance: the overlay holds this
     label in the word slot, then resumes on its own. Cleared on a normal open. */
  const [rsvpIntro,     setRsvpIntro]     = useState<string | undefined>();
  const [rsvpAdvancing, setRsvpAdvancing] = useState(false);
  const [rsvpEndOfBook, setRsvpEndOfBook] = useState(false);
  /* True from close until the close-time seek reports back. The seek is a real
     navigation, so progress writes during it must not clear the resume pointer. */
  const rsvpSeekingRef  = useRef(false);
  /* Guards against a second nextChapter() while one is still walking the spine
     (the overlay stays interactive during the async window). */
  const advancingRef    = useRef(false);
  /* Words streamed this session, accumulated ACROSS chapter advances — the
     per-chapter token array is discarded on every advance. */
  const rsvpWordsRef    = useRef(0);
  const rsvpSessionRef  = useRef<number | null>(null);
  /* Chapter the current tokens came from, and the one the saved pointer belongs
     to. A bare word index is ambiguous now that a session crosses chapters. */
  const rsvpHrefRef     = useRef<string | null>(null);
  const savedRsvpHrefRef = useRef<string | null>(null);

  const sheetAnim = useRef(new Animated.Value(0)).current;

  /* load saved WPM preference once */
  useEffect(() => {
    loadPrefs().then((p) => setRsvpWpm(p.rsvpWpm ?? 300));
  }, []);

  /* The WebView message handler and the debounced progress writer both run
     outside render and need the live value, not a captured one. */
  useEffect(() => { showRsvpRef.current = showRsvp; }, [showRsvp]);

  /* ── HTML built once after loading saved progress ── */

  useEffect(() => {
    let cancelled = false;
    getProgress(bookId).then(async (row) => {
      const savedCfi  = row?.cfi ?? null;
      const savedPage = row?.current_page ?? 0;
      const savedPct  = row?.percentage ?? 0;
      rsvpStartIdxRef.current = row?.rsvp_word_index ?? 0;
      savedRsvpHrefRef.current = row?.rsvp_href ?? null;
      if (savedPage && !cancelled) {
        startPageRef.current  = savedPage;
        latestPageRef.current = savedPage;
        setCurrentPage(savedPage);
        setPercentage(savedPct);
      }
      // Reader theme: follow the app theme (exact palette), or a chosen theme.
      const matchApp = await getSetting("readerMatchApp");
      const epubTheme: ReaderTheme = matchApp
        ? (isThemeDark(getThemeId()) ? "dark" : "light")
        : await getSetting("readerTheme");
      const palette = matchApp
        ? { bg: t.color.bg.base, fg: t.color.text.primary, link: t.color.accent.base }
        : { bg: null, fg: null, link: null };
      if (!cancelled) setSettings((prev) => ({ ...prev, theme: epubTheme, ...palette }));
      const html = buildReaderHtml(epubUrl, savedCfi, {
        ...DEFAULT_SETTINGS,
        theme: epubTheme,
        ...palette,
      });
      htmlRef.current = html;
      /* Local files load via a file:// HTML document (same documentDirectory
         tree) so epub.js can XHR the book on iOS. Remote URLs keep the
         original HTML-string path — zero behavior change for them. */
      let uri: string | null = null;
      if (epubUrl.startsWith("file://")) {
        try {
          uri = await writeReaderHtmlFile(html);
        } catch {
          uri = null; // fall back to HTML-string source
        }
      }
      if (!cancelled) {
        setSourceUri(uri);
        setHtmlReady(true);
      }
    });
    return () => { cancelled = true; };
  }, [bookId, epubUrl]);

  /* ── Load highlights & bookmarks ─────────────────── */

  useEffect(() => {
    getHighlightsForBook(bookId).then(setHighlights);
    getBookmarksForBook(bookId).then(setBookmarks);
  }, [bookId]);

  /* ── Session management ─────────────────────────── */

  const finishSession = useCallback(() => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    const pagesRead = Math.max(0, latestPageRef.current - startPageRef.current);
    endSession(sid, pagesRead);
    sessionIdRef.current = null;
  }, []);

  useEffect(() => {
    startSession(bookId).then((id) => { sessionIdRef.current = id; });
    return () => {
      finishSession();
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (caretTimerRef.current) clearTimeout(caretTimerRef.current);
    };
  }, [bookId, finishSession]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        finishSession();
      } else if (state === "active" && !sessionIdRef.current) {
        startPageRef.current = latestPageRef.current;
        startSession(bookId).then((id) => { sessionIdRef.current = id; });
      }
    });
    return () => sub.remove();
  }, [bookId, finishSession]);

  /* ── Progress saving ────────────────────────────── */

  const saveProgressDebounced = useCallback(
    (cfi: string, pct: number, page: number) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      latestPageRef.current = page;
      saveTimerRef.current = setTimeout(async () => {
        /* Speed reading drives real navigations (chapter advance, close-time
           seek). Those must not clear the RSVP resume pointer — D16 clears it
           when NORMAL reading resumes, and neither of these is that. */
        const inRsvp = showRsvpRef.current || rsvpSeekingRef.current;
        await updateProgress(bookId, page, pct, cfi, inRsvp);
        /* Nor should they rotate the page-reading session: the spine walk fires
           several of these, which would scatter one RSVP session across rows
           and inflate pages_read with synthetic jumps. */
        if (inRsvp) return;
        const pagesRead = Math.max(0, page - startPageRef.current);
        if (sessionIdRef.current && pagesRead > 0) {
          await endSession(sessionIdRef.current, pagesRead);
          const newId = await startSession(bookId);
          sessionIdRef.current = newId;
          startPageRef.current = page;
        }
      }, SAVE_DEBOUNCE);
    },
    [bookId]
  );

  /* ── Auto-hide controls ─────────────────────────── */

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const showAndReset = useCallback(() => {
    setShowControls(true);
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => setShowControls(false), AUTO_HIDE_MS);
  }, [clearHideTimer]);

  const keepAlive = useCallback(() => {
    if (!showControls) return;
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => setShowControls(false), AUTO_HIDE_MS);
  }, [showControls, clearHideTimer]);

  /* ── WebView JS injection ───────────────────────── */

  const inject = useCallback(
    (js: string) => webViewRef.current?.injectJavaScript(js + ";true;"),
    []
  );

  /* ── Settings ───────────────────────────────────── */

  const updateSettings = useCallback(
    (patch: Partial<ReaderSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        // Picking a classic reader theme in-book clears the app-palette colours
        // so the classic (filter) theme takes over.
        if (patch.theme !== undefined && patch.bg === undefined) {
          next.bg = null; next.fg = null; next.link = null;
        }
        const json = JSON.stringify(JSON.stringify(next));
        inject(`window.readerApi.applySettings(${json})`);
        return next;
      });
    },
    [inject]
  );

  const openSettings = useCallback(() => {
    clearHideTimer();
    setShowSettings(true);
    Animated.spring(sheetAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 7,
      tension: 40,
    }).start();
  }, [clearHideTimer, sheetAnim]);

  const closeSettings = useCallback(() => {
    Animated.spring(sheetAnim, {
      toValue: 0,
      useNativeDriver: true,
      friction: 7,
      tension: 40,
    }).start(() => {
      setShowSettings(false);
      showAndReset();
    });
  }, [sheetAnim, showAndReset]);

  const sheetTranslateY = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SHEET_HEIGHT + 60, 0],
  });

  /* ── Navigation ─────────────────────────────────── */

  const nextPage = useCallback(() => {
    inject("window.readerApi.nextPage()");
    keepAlive();
  }, [inject, keepAlive]);

  const prevPage = useCallback(() => {
    inject("window.readerApi.prevPage()");
    keepAlive();
  }, [inject, keepAlive]);

  const goToChapter = useCallback(
    (href: string) => {
      inject(`window.readerApi.goToChapter(${JSON.stringify(href)})`);
      setShowToc(false);
      showAndReset();
    },
    [inject, showAndReset]
  );

  /* Drag the progress bar to jump to any page. locationX is relative to the
     seek track (no horizontal padding), so x/width == fraction read. */
  const onSeekTouch = useCallback((x: number) => {
    const w = seekWidthRef.current;
    if (w > 0) setSeekPct(Math.max(0, Math.min(1, x / w)));
  }, []);

  const commitSeek = useCallback(() => {
    inject(`window.readerApi.goToPercentage(${seekPct})`);
    setSeeking(false);
    showAndReset();
  }, [inject, seekPct, showAndReset]);

  /* ── Bookmark toggle ───────────────────────────── */

  const handleToggleBookmark = useCallback(async () => {
    // Request current CFI from the WebView
    inject("window.readerApi.getCurrentCfi()");
  }, [inject]);

  /* ── Speed reading (RSVP) ──────────────────────── */

  const openRsvp = useCallback(() => {
    clearHideTimer();
    setShowControls(false);
    rsvpWordsRef.current = 0;
    setRsvpIntro(undefined);
    setRsvpAdvancing(false);
    setRsvpEndOfBook(false);
    // Speed reading gets its own session row so its words and WPM are not
    // averaged into page reading (and vice versa).
    startSession(bookId, "rsvp").then((id) => { rsvpSessionRef.current = id; });
    // Pull the current chapter's text; handler opens the overlay on reply.
    inject("window.readerApi.getChapterText()");
  }, [inject, clearHideTimer, bookId]);

  /* Chapter finished: walk the book itself to the next one and pull its text.
     The reply arrives as a chapterText message flagged `advanced`. The guard
     matters because the overlay stays interactive while the walk runs: a
     second finish would start a concurrent walk and skip a chapter. */
  const advanceRsvp = useCallback(() => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    setRsvpAdvancing(true);   // overlay says "Next chapter…", transport disabled
    inject("window.readerApi.nextChapter()");
  }, [inject]);

  /* End of book: go back to the chapter just finished rather than closing. */
  const backToLastChapter = useCallback(() => {
    setRsvpEndOfBook(false);
    rsvpStartIdxRef.current = 0;
    setRsvpEpoch((n) => n + 1);
  }, []);

  const closeRsvp = useCallback(
    (lastIndex: number) => {
      setShowRsvp(false);
      showRsvpRef.current = false;
      advancingRef.current = false;
      setRsvpAdvancing(false);
      setRsvpEndOfBook(false);
      setRsvpIntro(undefined);
      const hadTokens = rsvpTokens.length > 0;
      if (hadTokens) {
        /* Cancel any advance still walking the spine FIRST. Without this its
           display() resolves after our seek and drags the book a chapter
           forward — the exact bug this whole feature exists to prevent. */
        rsvpSeekingRef.current = true;
        inject("window.readerApi.cancelAdvance()");
        /* Leave the page where speed reading stopped, not where it was when the
           overlay opened. Tokens carry the block they came from, and goToBlock
           posts back the landed CFI — which drops the marker in the right spot. */
        const stop = rsvpTokens[Math.min(lastIndex, rsvpTokens.length - 1)];
        rsvpMarkerRef.current = true;
        inject(`window.readerApi.goToBlock(${stop?.paragraphIndex ?? 0})`);
      }
      // Close the RSVP session with everything streamed across all chapters.
      const words = rsvpWordsRef.current + (hadTokens ? lastIndex + 1 : 0);
      const sid = rsvpSessionRef.current;
      if (sid) {
        endSession(sid, 0, { wordsRead: words, wpmLast: rsvpWpm });
        rsvpSessionRef.current = null;
      }
      setRsvpTokens([]);
      rsvpWordsRef.current = 0;
      // Persist resume pointer (clamped to a real word, scoped to its chapter)
      // and remember the speed.
      const stopHref = rsvpHrefRef.current;
      savedRsvpHrefRef.current = hadTokens ? stopHref : null;
      setRsvpWordIndex(bookId, hadTokens ? lastIndex : null, stopHref);
      savePrefs({ rsvpWpm });
      showAndReset();
    },
    [bookId, rsvpTokens, rsvpWpm, showAndReset, inject]
  );

  /* ── Session summary on close ──────────────────── */

  const handleClose = useCallback(() => {
    const elapsed = Date.now() - sessionStartTime;
    const mins = Math.round(elapsed / 60000);
    const pagesRead = Math.max(0, latestPageRef.current - startPageRef.current);
    if (mins >= 1 || pagesRead > 0) {
      Alert.alert(
        "Session Summary",
        `Time: ${mins < 1 ? "< 1" : mins} min\nPages read: ${pagesRead}`,
        [{ text: "OK", onPress: onClose }]
      );
    } else {
      onClose?.();
    }
  }, [sessionStartTime, onClose]);

  /* ── Message handler ────────────────────────────── */

  const handleMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        switch (msg.type) {
          case "ready":
            // Enrich the library once per open: fill missing author/metadata
            // and grab the cover if the book has none yet.
            if (!coverTriedRef.current) {
              coverTriedRef.current = true;
              inject("window.readerApi.extractMeta()");
              if (!(await hasCover(bookId))) {
                inject("window.readerApi.extractCover()");
              }
            }
            break;
          case "meta":
            if (await applyEpubMeta(bookId, msg)) {
              await useLibraryStore.getState().loadLibrary();
            }
            break;
          case "cover":
            if (msg.dataUrl && (await saveCover(bookId, msg.dataUrl))) {
              await useLibraryStore.getState().loadLibrary();
            }
            break;
          case "tap":
            showAndReset();
            break;
          case "caret":
            caretStartIdxRef.current =
              typeof msg.wordIndex === "number" ? msg.wordIndex : 0;
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
            setChapterPage(msg.chapterPage ?? 0);
            setChapterPages(msg.chapterPages ?? 0);
            setChapter(msg.chapter ?? "");
            if (startPageRef.current === 0 && msg.currentPage > 0) {
              startPageRef.current = msg.currentPage;
            }
            if (msg.cfi) {
              saveProgressDebounced(
                msg.cfi,
                msg.percentage ?? 0,
                msg.currentPage ?? 0
              );
            }
            break;
          case "currentCfi": {
            const cfi = msg.cfi;
            if (cfi) {
              if (rsvpMarkerRef.current) {
                rsvpMarkerRef.current = false;
                // The close-time seek has landed: normal reading resumes from
                // here, so later progress writes may clear the pointer again.
                rsvpSeekingRef.current = false;
                // goToBlock has already moved the page; latestPageRef holds the
                // number that arrived with it (state here is a render behind).
                const page = latestPageRef.current || currentPage;
                await addBookmark(bookId, cfi, "⚡ Speed reading", page || undefined);
              } else {
                await toggleBookmark(bookId, cfi, currentPage || undefined);
              }
              const updated = await getBookmarksForBook(bookId);
              setBookmarks(updated);
            }
            break;
          }
          case "chapterText": {
            /* An advance that was cancelled by closing still posts its reply.
               Applying it would resurrect the overlay's tokens after close. */
            if (msg.advanced && !showRsvpRef.current) {
              advancingRef.current = false;
              break;
            }
            if (msg.advanced) {
              advancingRef.current = false;
              setRsvpAdvancing(false);
              // Bank the finished chapter before its tokens are replaced.
              rsvpWordsRef.current += rsvpTokens.length;
            }
            if (msg.endOfBook) {
              advancingRef.current = false;
              setRsvpAdvancing(false);
              /* Finishing a book is the one moment worth marking. It gets the
                 word slot and two real choices, not an OS dialog thrown over an
                 immersive reader with a ↻ that would replay the last chapter. */
              setRsvpEndOfBook(true);
              break;
            }
            const paragraphs: string[] = Array.isArray(msg.paragraphs)
              ? msg.paragraphs
              : [];
            const tokens = tokenizeParagraphs(paragraphs);
            setRsvpTokens(tokens);
            setRsvpChapter(msg.chapter || chapter || "");
            rsvpHrefRef.current = msg.href ?? null;
            if (msg.advanced) {
              /* Auto-advanced past a chapter end. The overlay remounts at word
                 0 and holds the label before resuming; a chapter with no
                 resolvable title skips the hold rather than showing a blank. */
              rsvpStartIdxRef.current = 0;
              const label =
                msg.chapter ||
                (typeof msg.spineIndex === "number"
                  ? `Chapter ${msg.spineIndex}`
                  : "");
              setRsvpIntro(label || undefined);
              setRsvpEpoch((n) => n + 1);
              break;
            }
            // A normal open holds nothing: the reader chose to be here.
            setRsvpIntro(undefined);
            // If a caret start word was chosen, begin there (no resume prompt).
            const caretStart = caretStartIdxRef.current;
            if (caretStart > 0 && tokens.length > 0) {
              caretStartIdxRef.current = 0;
              rsvpStartIdxRef.current = Math.min(caretStart, tokens.length - 1);
              setShowRsvp(true);
              break;
            }
            /* Resume only if the pointer belongs to THIS chapter and still
               lands inside it. Matching on length alone would happily resume
               40% into a different chapter that happened to be long enough. */
            const saved = rsvpStartIdxRef.current;
            const savedHref = savedRsvpHrefRef.current;
            const canResume =
              saved > 0 &&
              saved < tokens.length &&
              (!savedHref || savedHref === msg.href);
            if (canResume) {
              const pct = Math.round((saved / tokens.length) * 100);
              Alert.alert(
                "Speed reading",
                `Resume where you left off (${pct}% through this chapter) or start from the beginning?`,
                [
                  { text: "Start over", onPress: () => { rsvpStartIdxRef.current = 0; setShowRsvp(true); } },
                  { text: "Resume", onPress: () => { rsvpStartIdxRef.current = saved; setShowRsvp(true); } },
                ]
              );
            } else {
              rsvpStartIdxRef.current = 0;
              setShowRsvp(true);
            }
            break;
          }
          case "textSelected": {
            if (msg.text && msg.cfiRange) {
              await addHighlight(bookId, msg.cfiRange, msg.text);
              const updated = await getHighlightsForBook(bookId);
              setHighlights(updated);
              inject("window.readerApi.clearSelection()");
            }
            break;
          }
          case "error":
            console.warn("Reader error:", msg.message);
            break;
        }
      } catch {
        /* malformed message */
      }
    },
    [saveProgressDebounced, showAndReset, bookId, currentPage, inject, chapter, rsvpTokens.length]
  );

  /* ── Derived values ─────────────────────────────── */

  const theme      = settings.theme;
  const barBg      = THEME_BAR_BG[theme];
  const barBorder  = THEME_BAR_BORDER[theme];
  const fg         = THEME_FG[theme];
  const sub        = THEME_SUB[theme];
  const accent     = THEME_ACCENT[theme];
  const readingTime = readingTimeLabel(currentPage, totalPages);
  const insets = useSafeAreaInsets();
  const { width: winWidth } = useWindowDimensions();
  const chapterLeft = chapterPages
    ? `${Math.max(0, chapterPages - chapterPage)} left in chapter`
    : "";

  const fontSizeIdx   = useMemo(() => FONT_SIZES.indexOf(settings.fontSize), [settings.fontSize]);
  const lineHeightIdx = useMemo(() => LINE_HEIGHTS.indexOf(settings.lineHeight), [settings.lineHeight]);
  const marginIdx     = useMemo(() => MARGINS.indexOf(settings.marginWidth), [settings.marginWidth]);

  /* ── Render ─────────────────────────────────────── */

  return (
    <View style={[s.root, { backgroundColor: THEME_BG[theme] }]}>
      {/* WebView */}
      {htmlReady && htmlRef.current && (
        <WebView
          ref={webViewRef}
          source={sourceUri ? { uri: sourceUri } : { html: htmlRef.current }}
          originWhitelist={["*"]}
          onMessage={handleMessage}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          allowingReadAccessToURL={readAccessRoot()}
          mixedContentMode="always"
          // Keep the page inside the safe area; edge-to-edge Android
          // otherwise renders the book under the status/navigation bars.
          style={[s.webView, { marginTop: insets.top, marginBottom: insets.bottom }]}
        />
      )}

      {/* Tap zones — reliable native layer. In-WebView tap detection did
          not fire on Android (epub.js iframe), so the RN overlay owns taps:
          left third = back, right third = forward, middle = menu/options.
          Sits above the WebView, below the control bars (which render later
          and keep their own touch targets).
          ponytail: overlay intercepts touches, so in-book long-press text
          selection is superseded; add a toolbar "highlight" affordance if
          selection is wanted back. */}
      {/* Long-press + drag places a caret to pick the speed-reading start word;
          a plain tap keeps the zone navigation (left/right/menu). */}
      {htmlReady && !showRsvp && (
        <View
          style={StyleSheet.absoluteFill}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) => {
            const { locationX, locationY } = e.nativeEvent;
            caretGrantRef.current = { x: locationX, y: locationY };
            caretActiveRef.current = false;
            if (caretTimerRef.current) clearTimeout(caretTimerRef.current);
            caretTimerRef.current = setTimeout(() => {
              caretActiveRef.current = true;
              inject(`window.readerApi.caretAt(${locationX}, ${locationY - insets.top})`);
            }, 400);
          }}
          onResponderMove={(e) => {
            const { locationX, locationY } = e.nativeEvent;
            if (caretActiveRef.current) {
              inject(`window.readerApi.caretAt(${locationX}, ${locationY - insets.top})`);
            } else if (caretGrantRef.current) {
              const dx = Math.abs(locationX - caretGrantRef.current.x);
              const dy = Math.abs(locationY - caretGrantRef.current.y);
              if ((dx > 10 || dy > 10) && caretTimerRef.current) {
                clearTimeout(caretTimerRef.current); // moved first → not a long-press
              }
            }
          }}
          onResponderRelease={(e) => {
            if (caretTimerRef.current) clearTimeout(caretTimerRef.current);
            if (caretActiveRef.current) { caretActiveRef.current = false; return; }
            const zone = tapZone(e.nativeEvent.locationX, winWidth);
            if (zone === "prev") prevPage();
            else if (zone === "next") nextPage();
            else if (showControls) setShowControls(false);
            else showAndReset();
          }}
          onResponderTerminate={() => {
            if (caretTimerRef.current) clearTimeout(caretTimerRef.current);
            caretActiveRef.current = false;
          }}
        />
      )}

      {/* ── Always-on progress footer (hidden when full controls show) ── */}
      {!showControls && !showSettings && !showToc && !showBookmarks && !showHighlights && (
        <View style={[s.footer, { paddingBottom: insets.bottom }]} pointerEvents="none">
          <View style={[s.progressTrack, { backgroundColor: barBorder }]}>
            <View
              style={[
                s.progressFill,
                { backgroundColor: accent, width: `${Math.min(percentage, 100)}%` as `${number}%` },
              ]}
            />
          </View>
          <View style={s.statsRow}>
            <Text style={[s.statText, { color: sub }]}>
              {currentPage && totalPages ? `${currentPage} / ${totalPages}` : ""}
            </Text>
            <Text style={[s.statText, { color: sub }]}>{chapterLeft}</Text>
            <Text style={[s.statText, { color: sub }]}>
              {percentage > 0 ? `${percentage.toFixed(1)}%` : ""}
            </Text>
          </View>
        </View>
      )}

      {/* ── Top bar ──────────────────────────────── */}
      {showControls && !showSettings && !showToc && !showBookmarks && !showHighlights && (
        <SafeAreaView
          style={[s.topBar, { backgroundColor: barBg, borderBottomColor: barBorder }]}
          pointerEvents="box-none"
        >
          <View style={s.topBarInner} pointerEvents="auto">
            <Pressable onPress={handleClose} style={s.barBtn} onPressIn={keepAlive}>
              <Text style={[s.barBtnIcon, { color: fg }]}>←</Text>
            </Pressable>

            <Text style={[s.chapterTitle, { color: fg }]} numberOfLines={1}>
              {chapter || title || ""}
            </Text>

            <Pressable
              onPress={handleToggleBookmark}
              style={s.barBtn}
              onPressIn={keepAlive}
            >
              <IconSymbol
                name="bookmark.fill"
                size={18}
                color={fg}
              />
            </Pressable>

            <Pressable
              onPress={() => { clearHideTimer(); setShowToc(true); }}
              style={s.barBtn}
              onPressIn={keepAlive}
            >
              <Text style={[s.barBtnIcon, { color: fg }]}>☰</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      )}

      {/* ── Bottom bar ───────────────────────────── */}
      {showControls && !showSettings && !showToc && !showBookmarks && !showHighlights && (
        <SafeAreaView
          style={[s.bottomBar, { backgroundColor: barBg, borderTopColor: barBorder }]}
          pointerEvents="box-none"
        >
          <View pointerEvents="auto">
            {/* Progress track — draggable to jump to any page */}
            <View style={s.progressWrap}>
              <View
                style={s.seekHit}
                onLayout={(e) => { seekWidthRef.current = e.nativeEvent.layout.width; }}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={(e) => { clearHideTimer(); setSeeking(true); onSeekTouch(e.nativeEvent.locationX); }}
                onResponderMove={(e) => onSeekTouch(e.nativeEvent.locationX)}
                onResponderRelease={commitSeek}
                onResponderTerminate={commitSeek}
              >
                <View style={[s.progressTrack, { backgroundColor: barBorder }]}>
                  <View
                    style={[
                      s.progressFill,
                      { backgroundColor: accent, width: `${(seeking ? seekPct * 100 : Math.min(percentage, 100))}%` as `${number}%` },
                    ]}
                  />
                </View>
                <View
                  style={[
                    s.seekThumb,
                    { backgroundColor: accent, left: `${(seeking ? seekPct * 100 : Math.min(percentage, 100))}%` as `${number}%` },
                  ]}
                />
              </View>
            </View>

            {/* Stats row */}
            <View style={s.statsRow}>
              <Text style={[s.statText, { color: sub }]}>
                {seeking && totalPages
                  ? `→ ${Math.max(1, Math.round(seekPct * totalPages))} / ${totalPages}`
                  : currentPage && totalPages ? `${currentPage} / ${totalPages}` : ""}
              </Text>
              <Text style={[s.statText, { color: sub }]}>{chapterLeft || readingTime}</Text>
              <Text style={[s.statText, { color: sub }]}>
                {percentage > 0 ? `${percentage.toFixed(1)}%` : ""}
              </Text>
            </View>

            {/* Controls row */}
            <View style={s.controlRow}>
              <Pressable onPress={prevPage} style={s.navBtn} onPressIn={keepAlive}>
                <Text style={[s.navBtnText, { color: fg }]}>‹</Text>
              </Pressable>

              <Pressable onPress={openSettings} style={s.settingsBtn} onPressIn={keepAlive}>
                <Text style={[s.settingsBtnText, { color: accent }]}>Aa</Text>
              </Pressable>

              <Pressable
                onPress={() => { clearHideTimer(); setShowHighlights(true); }}
                style={s.barBtn}
                onPressIn={keepAlive}
              >
                <IconSymbol name="highlighter" size={18} color={accent} />
                {highlights.length > 0 && (
                  <View style={s.badge}>
                    <Text style={s.badgeText}>{highlights.length}</Text>
                  </View>
                )}
              </Pressable>

              <Pressable
                onPress={openRsvp}
                style={s.speedBtn}
                onPressIn={keepAlive}
                accessibilityLabel="Speed read this chapter"
              >
                <IconSymbol name="bolt.fill" size={20} color={accent} />
              </Pressable>

              <Pressable onPress={nextPage} style={s.navBtn} onPressIn={keepAlive}>
                <Text style={[s.navBtnText, { color: fg }]}>›</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      )}

      {/* ── Settings sheet ───────────────────────── */}
      {showSettings && (
        <>
          <Pressable
            style={[StyleSheet.absoluteFill, s.settingsOverlay]}
            onPress={closeSettings}
          />
          <Animated.View
            style={[s.settingsSheet, { transform: [{ translateY: sheetTranslateY }] }]}
          >
            {/* Handle */}
            <View style={s.sheetHandle} />

            {/* Header */}
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Reading Settings</Text>
              <Pressable onPress={closeSettings} style={s.sheetCloseBtn}>
                <Text style={s.sheetCloseBtnText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              bounces={false}
              style={s.sheetScroll}
              contentContainerStyle={s.sheetScrollContent}
            >
              {/* Themes */}
              <Text style={s.sheetSectionLabel}>Theme</Text>
              <View style={s.themeRow}>
                {THEMES_ORDER.map((th) => {
                  const active = settings.theme === th;
                  return (
                    <Pressable
                      key={th}
                      style={[
                        s.themeSwatch,
                        { backgroundColor: THEME_SWATCHES[th] },
                        active && s.themeSwatchActive,
                      ]}
                      onPress={() => updateSettings({ theme: th })}
                    >
                      {active && (
                        <View style={s.themeCheck}>
                          <Text style={s.themeCheckMark}>✓</Text>
                        </View>
                      )}
                      <Text
                        style={[
                          s.themeSwatchLabel,
                          { color: THEME_FG[th] },
                        ]}
                      >
                        {THEME_LABEL[th]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Fonts */}
              <Text style={s.sheetSectionLabel}>Font</Text>
              <View style={s.fontRow}>
                {FONTS_ORDER.map((f) => {
                  const active = settings.font === f;
                  return (
                    <Pressable
                      key={f}
                      style={[s.fontPill, active && s.fontPillActive]}
                      onPress={() => updateSettings({ font: f })}
                    >
                      <Text style={[s.fontPillText, active && s.fontPillTextActive]}>
                        {FONT_LABEL[f]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Font size */}
              <SettingRow
                label="Font Size"
                value={`${settings.fontSize}px`}
                onDecrement={() => {
                  if (fontSizeIdx > 0)
                    updateSettings({ fontSize: FONT_SIZES[fontSizeIdx - 1] });
                }}
                onIncrement={() => {
                  if (fontSizeIdx < FONT_SIZES.length - 1)
                    updateSettings({ fontSize: FONT_SIZES[fontSizeIdx + 1] });
                }}
                canDecrement={fontSizeIdx > 0}
                canIncrement={fontSizeIdx < FONT_SIZES.length - 1}
                decrementLabel="A−"
                incrementLabel="A+"
              />

              {/* Line height */}
              <SettingRow
                label="Line Spacing"
                value={settings.lineHeight.toFixed(1)}
                onDecrement={() => {
                  if (lineHeightIdx > 0)
                    updateSettings({ lineHeight: LINE_HEIGHTS[lineHeightIdx - 1] });
                }}
                onIncrement={() => {
                  if (lineHeightIdx < LINE_HEIGHTS.length - 1)
                    updateSettings({ lineHeight: LINE_HEIGHTS[lineHeightIdx + 1] });
                }}
                canDecrement={lineHeightIdx > 0}
                canIncrement={lineHeightIdx < LINE_HEIGHTS.length - 1}
                decrementLabel="−"
                incrementLabel="+"
              />

              {/* Margins */}
              <SettingRow
                label="Margins"
                value={`${settings.marginWidth}px`}
                onDecrement={() => {
                  if (marginIdx > 0)
                    updateSettings({ marginWidth: MARGINS[marginIdx - 1] });
                }}
                onIncrement={() => {
                  if (marginIdx < MARGINS.length - 1)
                    updateSettings({ marginWidth: MARGINS[marginIdx + 1] });
                }}
                canDecrement={marginIdx > 0}
                canIncrement={marginIdx < MARGINS.length - 1}
                decrementLabel="−"
                incrementLabel="+"
              />
            </ScrollView>
          </Animated.View>
        </>
      )}

      {/* ── TOC overlay ──────────────────────────── */}
      {showToc && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable
            style={[StyleSheet.absoluteFill, s.tocOverlay]}
            onPress={() => { setShowToc(false); showAndReset(); }}
          />
          <SafeAreaView style={s.tocContainer} pointerEvents="box-none">
            <View style={s.tocSheet} pointerEvents="auto">
              <View style={s.tocHeader}>
                <Text style={s.tocTitle}>Contents</Text>
                <Pressable
                  onPress={() => { setShowToc(false); showAndReset(); }}
                  style={s.tocCloseBtn}
                >
                  <Text style={s.tocCloseBtnText}>✕</Text>
                </Pressable>
              </View>

              {toc.length === 0 ? (
                <View style={s.tocEmpty}>
                  <Text style={s.tocEmptyText}>No table of contents available</Text>
                </View>
              ) : (
                <ScrollView
                  style={s.tocScroll}
                  showsVerticalScrollIndicator={false}
                  bounces
                >
                  {toc.map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => goToChapter(item.href)}
                      style={({ pressed }) => [
                        s.tocItem,
                        { paddingLeft: t.space._5 + item.level * t.space._4 },
                        pressed && s.tocItemPressed,
                      ]}
                    >
                      <Text
                        style={[s.tocItemText, item.level > 0 && s.tocItemNested]}
                        numberOfLines={2}
                      >
                        {item.label}
                      </Text>
                      <Text style={s.tocItemChevron}>›</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          </SafeAreaView>
        </View>
      )}

      {/* ── Bookmarks overlay ──────────────────────── */}
      {showBookmarks && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable
            style={[StyleSheet.absoluteFill, s.tocOverlay]}
            onPress={() => { setShowBookmarks(false); showAndReset(); }}
          />
          <SafeAreaView style={s.tocContainer} pointerEvents="box-none">
            <View style={s.tocSheet} pointerEvents="auto">
              <View style={s.tocHeader}>
                <Text style={s.tocTitle}>Bookmarks</Text>
                <Pressable
                  onPress={() => { setShowBookmarks(false); showAndReset(); }}
                  style={s.tocCloseBtn}
                >
                  <Text style={s.tocCloseBtnText}>✕</Text>
                </Pressable>
              </View>
              {bookmarks.length === 0 ? (
                <View style={s.tocEmpty}>
                  <Text style={s.tocEmptyText}>No bookmarks yet</Text>
                </View>
              ) : (
                <ScrollView style={s.tocScroll} showsVerticalScrollIndicator={false}>
                  {bookmarks.map((bm) => (
                    <Pressable
                      key={bm.id}
                      onPress={() => {
                        inject(`window.readerApi.goToCfi(${JSON.stringify(bm.cfi)})`);
                        setShowBookmarks(false);
                        showAndReset();
                      }}
                      style={({ pressed }) => [s.tocItem, pressed && s.tocItemPressed]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={s.tocItemText}>
                          {bm.label || `Page ${bm.page_number || "?"}`}
                        </Text>
                        <Text style={[s.statText, { color: THEME_SUB[theme] }]}>
                          {new Date(bm.created_at).toLocaleDateString()}
                        </Text>
                      </View>
                      <Text style={s.tocItemChevron}>›</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          </SafeAreaView>
        </View>
      )}

      {/* ── Highlights overlay ─────────────────────── */}
      {showHighlights && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable
            style={[StyleSheet.absoluteFill, s.tocOverlay]}
            onPress={() => { setShowHighlights(false); showAndReset(); }}
          />
          <SafeAreaView style={s.tocContainer} pointerEvents="box-none">
            <View style={s.tocSheet} pointerEvents="auto">
              <View style={s.tocHeader}>
                <Text style={s.tocTitle}>Highlights</Text>
                <Pressable
                  onPress={() => { setShowHighlights(false); showAndReset(); }}
                  style={s.tocCloseBtn}
                >
                  <Text style={s.tocCloseBtnText}>✕</Text>
                </Pressable>
              </View>
              {highlights.length === 0 ? (
                <View style={s.tocEmpty}>
                  <Text style={s.tocEmptyText}>Select text while reading to highlight</Text>
                </View>
              ) : (
                <ScrollView style={s.tocScroll} showsVerticalScrollIndicator={false}>
                  {highlights.map((hl) => (
                    <Pressable
                      key={hl.id}
                      onPress={() => {
                        inject(`window.readerApi.goToCfi(${JSON.stringify(hl.cfi_range)})`);
                        setShowHighlights(false);
                        showAndReset();
                      }}
                      style={({ pressed }) => [s.highlightItem, pressed && s.tocItemPressed]}
                    >
                      <View style={[s.highlightDot, { backgroundColor: hl.color }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.highlightText} numberOfLines={3}>
                          &ldquo;{hl.text}&rdquo;
                        </Text>
                        {hl.note && (
                          <Text style={s.highlightNote} numberOfLines={1}>
                            {hl.note}
                          </Text>
                        )}
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          </SafeAreaView>
        </View>
      )}

      {/* ── RSVP speed-reading overlay ─────────────── */}
      {showRsvp && (
        <RsvpOverlay
          key={rsvpEpoch}
          tokens={rsvpTokens}
          initialWpm={rsvpWpm}
          startIndex={rsvpStartIdxRef.current}
          chapter={rsvpChapter}
          colors={{
            bg:     t.color.bg.base,
            fg:     t.color.text.primary,
            sub:    t.color.text.tertiary,
            accent: t.color.accent.base,
            barBg:  t.color.bg.raised,
            border: t.color.border.default,
          }}
          onWpmChange={setRsvpWpm}
          onFinish={advanceRsvp}
          introLabel={rsvpIntro}
          advancing={rsvpAdvancing}
          endOfBook={rsvpEndOfBook}
          bookTitle={title}
          onBackToChapter={backToLastChapter}
          onClose={closeRsvp}
        />
      )}
    </View>
  );
}

/* ── Setting row helper ─────────────────────────────── */

function SettingRow({
  label,
  value,
  onDecrement,
  onIncrement,
  canDecrement,
  canIncrement,
  decrementLabel,
  incrementLabel,
}: {
  label:          string;
  value:          string;
  onDecrement:    () => void;
  onIncrement:    () => void;
  canDecrement:   boolean;
  canIncrement:   boolean;
  decrementLabel: string;
  incrementLabel: string;
}) {
  return (
    <View style={s.settingRow}>
      <Text style={s.settingRowLabel}>{label}</Text>
      <View style={s.settingRowControl}>
        <Pressable
          onPress={onDecrement}
          disabled={!canDecrement}
          style={[s.stepBtn, !canDecrement && s.stepBtnDisabled]}
        >
          <Text style={[s.stepBtnText, !canDecrement && s.stepBtnTextDisabled]}>
            {decrementLabel}
          </Text>
        </Pressable>
        <Text style={s.settingRowValue}>{value}</Text>
        <Pressable
          onPress={onIncrement}
          disabled={!canIncrement}
          style={[s.stepBtn, !canIncrement && s.stepBtnDisabled]}
        >
          <Text style={[s.stepBtnText, !canIncrement && s.stepBtnTextDisabled]}>
            {incrementLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ── Styles ─────────────────────────────────────────── */

const s = StyleSheet.create({
  root: {
    flex: 1,
  },
  webView: {
    flex: 1,
  },

  /* top bar */
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBarInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: t.space._4,
    paddingVertical: t.space._3,
  },
  barBtn: {
    padding: t.space._2,
    minWidth: 40,
    alignItems: "center",
  },
  barBtnIcon: {
    fontSize: 20,
    fontWeight: "400",
  },
  chapterTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginHorizontal: t.space._2,
  },

  /* bottom bar */
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  /* always-on slim progress footer (no background: sits over the page edge) */
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: t.space._5,
    paddingTop: t.space._2,
  },
  progressWrap: {
    paddingHorizontal: t.space._5,
    paddingTop: t.space._3,
  },
  /* generous vertical grab area around the thin visual track */
  seekHit: {
    justifyContent: "center",
    paddingVertical: 12,
  },
  seekThumb: {
    position: "absolute",
    top: "50%",
    width: 14,
    height: 14,
    borderRadius: 7,
    marginTop: -7,
    marginLeft: -7,
  },
  progressTrack: {
    height: 3,
    borderRadius: 1.5,
    overflow: "hidden",
  },
  progressFill: {
    height: 3,
    borderRadius: 1.5,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: t.space._5,
    paddingTop: 4,
  },
  statText: {
    fontSize: 11,
    fontWeight: "500",
  },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: t.space._4,
    paddingVertical: t.space._3,
    gap: 28,
  },
  speedBtn: {
    padding: t.space._2,
    minWidth: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  navBtn: {
    padding: t.space._2,
    minWidth: 44,
    alignItems: "center",
  },
  navBtnText: {
    fontSize: 28,
    fontWeight: "300",
    lineHeight: 32,
  },
  settingsBtn: {
    paddingHorizontal: t.space._5,
    paddingVertical: t.space._2,
    borderRadius: t.radius["2xl"],
    backgroundColor: t.color.accent.bg,
    borderWidth: 1,
    borderColor: t.color.accent.border,
  },
  settingsBtnText: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  /* settings sheet */
  settingsOverlay: {
    backgroundColor: "rgba(0,0,0,0.38)",
  },
  settingsSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
    backgroundColor: t.color.bg.base,
    borderTopLeftRadius: t.radius["4xl"],
    borderTopRightRadius: t.radius["4xl"],
    ...t.shadow.heavy,
    paddingBottom: Platform.OS === "ios" ? 24 : t.space._4,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: t.color.border.default,
    alignSelf: "center",
    marginTop: t.space._3,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: t.space._5,
    paddingVertical: t.space._3,
  },
  sheetTitle: {
    ...t.font.headline,
  },
  sheetCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: t.color.bg.overlay,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetCloseBtnText: {
    color: t.color.text.secondary,
    fontSize: 13,
    fontWeight: "700",
  },
  sheetScroll: {
    flex: 1,
  },
  sheetScrollContent: {
    paddingHorizontal: t.space._5,
    paddingBottom: t.space._4,
  },
  sheetSectionLabel: {
    ...t.font.label,
    marginBottom: t.space._2,
    marginTop: t.space._4,
  },

  /* theme swatches */
  themeRow: {
    flexDirection: "row",
    gap: t.space._3,
  },
  themeSwatch: {
    flex: 1,
    height: 64,
    borderRadius: t.radius.xl,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 8,
    borderWidth: 1.5,
    borderColor: t.color.border.default,
  },
  themeSwatchActive: {
    borderColor: t.color.accent.base,
    borderWidth: 2,
  },
  themeSwatchLabel: {
    fontSize: 11,
    fontWeight: "700",
  },
  themeCheck: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: t.color.accent.base,
    alignItems: "center",
    justifyContent: "center",
  },
  themeCheckMark: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },

  /* font pills */
  fontRow: {
    flexDirection: "row",
    gap: t.space._2,
  },
  fontPill: {
    flex: 1,
    paddingVertical: t.space._2,
    borderRadius: t.radius.xl,
    alignItems: "center",
    backgroundColor: t.color.bg.raised,
    borderWidth: 1,
    borderColor: t.color.border.default,
  },
  fontPillActive: {
    backgroundColor: t.color.accent.bgStrong,
    borderColor: t.color.accent.border,
  },
  fontPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: t.color.text.secondary,
  },
  fontPillTextActive: {
    color: t.color.accent.strong,
    fontWeight: "700",
  },

  /* setting rows */
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: t.space._3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.color.border.subtle,
  },
  settingRowLabel: {
    ...t.font.body,
    flex: 1,
  },
  settingRowControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space._3,
  },
  settingRowValue: {
    ...t.font.body,
    color: t.color.text.tertiary,
    minWidth: 48,
    textAlign: "center",
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: t.radius.xl,
    backgroundColor: t.color.bg.raised,
    borderWidth: 1,
    borderColor: t.color.border.default,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnDisabled: {
    opacity: 0.35,
  },
  stepBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: t.color.text.primary,
  },
  stepBtnTextDisabled: {
    color: t.color.text.faint,
  },

  /* TOC */
  tocOverlay: {
    backgroundColor: "rgba(30,53,72,0.55)",
  },
  tocContainer: {
    flex: 1,
    margin: t.space._4,
  },
  tocSheet: {
    flex: 1,
    backgroundColor: t.color.bg.base,
    borderRadius: t.radius["3xl"],
    overflow: "hidden",
    ...t.shadow.heavy,
  },
  tocHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: t.space._5,
    paddingVertical: t.space._4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.color.border.default,
  },
  tocTitle: {
    ...t.font.title,
  },
  tocCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: t.color.bg.overlay,
    alignItems: "center",
    justifyContent: "center",
  },
  tocCloseBtnText: {
    color: t.color.text.secondary,
    fontSize: 13,
    fontWeight: "700",
  },
  tocEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: t.space._8,
  },
  tocEmptyText: {
    ...t.font.body,
    color: t.color.text.tertiary,
  },
  tocScroll: {
    flex: 1,
  },
  tocItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: t.space._5,
    paddingVertical: t.space._4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.color.border.subtle,
  },
  tocItemPressed: {
    backgroundColor: t.color.bg.raised,
  },
  tocItemText: {
    flex: 1,
    ...t.font.body,
    lineHeight: 20,
  },
  tocItemNested: {
    color: t.color.text.tertiary,
    fontSize: 14,
  },
  tocItemChevron: {
    color: t.color.text.faint,
    fontSize: 20,
    fontWeight: "300",
    marginLeft: t.space._2,
  },

  /* highlights & bookmarks */
  badge: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: t.color.accent.base,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
  },
  highlightItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: t.space._5,
    paddingVertical: t.space._4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.color.border.subtle,
    gap: t.space._3,
  },
  highlightDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  highlightText: {
    ...t.font.body,
    fontStyle: "italic",
    lineHeight: 20,
  },
  highlightNote: {
    ...t.font.caption,
    color: t.color.text.tertiary,
    marginTop: t.space._1,
  },
});
