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
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
} from "@/services/readingTracker";
import { t } from "@/theme";

/* ── Types ──────────────────────────────────────────── */

interface TocItem {
  id: string;
  label: string;
  href: string;
  index: number;
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

  const [htmlReady,     setHtmlReady]     = useState(false);
  const [settings,      setSettings]      = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [showControls,  setShowControls]  = useState(false);
  const [showSettings,  setShowSettings]  = useState(false);
  const [showToc,       setShowToc]       = useState(false);
  const [toc,           setToc]           = useState<TocItem[]>([]);
  const [chapter,       setChapter]       = useState("");
  const [percentage,    setPercentage]    = useState(0);
  const [currentPage,   setCurrentPage]   = useState(0);
  const [totalPages,    setTotalPages]    = useState(0);

  const sheetAnim = useRef(new Animated.Value(0)).current;

  /* ── HTML built once after loading saved progress ── */

  useEffect(() => {
    getProgress(bookId).then((row) => {
      const savedCfi  = row?.cfi ?? null;
      const savedPage = row?.current_page ?? 0;
      const savedPct  = row?.percentage ?? 0;
      if (savedPage) {
        startPageRef.current  = savedPage;
        latestPageRef.current = savedPage;
        setCurrentPage(savedPage);
        setPercentage(savedPct);
      }
      htmlRef.current = buildReaderHtml(epubUrl, savedCfi, DEFAULT_SETTINGS);
      setHtmlReady(true);
    });
  }, [bookId, epubUrl]);

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
        await updateProgress(bookId, page, pct, cfi);
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
        const settingsJson = JSON.stringify(next);
        const escapedJson  = JSON.stringify(settingsJson);
        inject(`window.readerApi.applySettings(${escapedJson})`);
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

  /* ── Message handler ────────────────────────────── */

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        switch (msg.type) {
          case "ready":
            break;
          case "tap":
            showAndReset();
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
              saveProgressDebounced(
                msg.cfi,
                msg.percentage ?? 0,
                msg.currentPage ?? 0
              );
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
    [saveProgressDebounced, showAndReset]
  );

  /* ── Derived values ─────────────────────────────── */

  const theme      = settings.theme;
  const barBg      = THEME_BAR_BG[theme];
  const barBorder  = THEME_BAR_BORDER[theme];
  const fg         = THEME_FG[theme];
  const sub        = THEME_SUB[theme];
  const accent     = THEME_ACCENT[theme];
  const readingTime = readingTimeLabel(currentPage, totalPages);

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
          source={{ html: htmlRef.current }}
          originWhitelist={["*"]}
          onMessage={handleMessage}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess
          allowUniversalAccessFromFileURLs
          mixedContentMode="always"
          style={s.webView}
        />
      )}

      {/* Tap zones — left / center / right */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={s.tapRow} pointerEvents="box-none">
          <Pressable style={s.tapLeft}   onPress={prevPage} />
          <Pressable style={s.tapCenter} onPress={showAndReset} />
          <Pressable style={s.tapRight}  onPress={nextPage} />
        </View>
      </View>

      {/* ── Top bar ──────────────────────────────── */}
      {showControls && !showSettings && !showToc && (
        <SafeAreaView
          style={[s.topBar, { backgroundColor: barBg, borderBottomColor: barBorder }]}
          pointerEvents="box-none"
        >
          <View style={s.topBarInner} pointerEvents="auto">
            <Pressable onPress={onClose} style={s.barBtn} onPressIn={keepAlive}>
              <Text style={[s.barBtnIcon, { color: fg }]}>←</Text>
            </Pressable>

            <Text style={[s.chapterTitle, { color: fg }]} numberOfLines={1}>
              {chapter || title || ""}
            </Text>

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
      {showControls && !showSettings && !showToc && (
        <SafeAreaView
          style={[s.bottomBar, { backgroundColor: barBg, borderTopColor: barBorder }]}
          pointerEvents="box-none"
        >
          <View pointerEvents="auto">
            {/* Progress track */}
            <View style={s.progressWrap}>
              <View style={[s.progressTrack, { backgroundColor: barBorder }]}>
                <View
                  style={[
                    s.progressFill,
                    { backgroundColor: accent, width: `${Math.min(percentage, 100)}%` as `${number}%` },
                  ]}
                />
              </View>
            </View>

            {/* Stats row */}
            <View style={s.statsRow}>
              <Text style={[s.statText, { color: sub }]}>
                {currentPage && totalPages ? `${currentPage} / ${totalPages}` : ""}
              </Text>
              <Text style={[s.statText, { color: sub }]}>{readingTime}</Text>
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
                      style={({ pressed }) => [s.tocItem, pressed && s.tocItemPressed]}
                    >
                      <Text style={s.tocItemText} numberOfLines={2}>
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

  /* tap zones */
  tapRow: {
    flex: 1,
    flexDirection: "row",
  },
  tapLeft: {
    flex: 1,
  },
  tapCenter: {
    flex: 2,
  },
  tapRight: {
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
  progressWrap: {
    paddingHorizontal: t.space._5,
    paddingTop: t.space._3,
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
    gap: 48,
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
  tocItemChevron: {
    color: t.color.text.faint,
    fontSize: 20,
    fontWeight: "300",
    marginLeft: t.space._2,
  },
});
