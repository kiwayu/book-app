import { useRef } from "react";
import { View, Text, Pressable, StyleSheet, Platform, Animated } from "react-native";
import Swipeable from "react-native-gesture-handler/Swipeable";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { t } from "@/theme";
import type { BookWithEntry } from "@/store/libraryStore";
import type { BookCardProgress } from "./BookCard";

/* ── Props ────────────────────────────────────────── */

export interface CompactBookRowProps {
  book: BookWithEntry;
  progress?: BookCardProgress;
  onPress: () => void;
  onLongPress?: () => void;
  onStartReading?: () => void;
  onMarkFinished?: () => void;
  onMarkDNF?: () => void;
  onSwipeableWillOpen?: (ref: Swipeable) => void;
}

/* ── Swipe helpers ────────────────────────────────── */

interface SwipeAction {
  label: string;
  icon: string;
  color: string;
  action: () => void;
}

function resolveSwipeActions(
  status: string,
  props: CompactBookRowProps,
): { left: SwipeAction | null; right: SwipeAction | null } {
  let left: SwipeAction | null = null;
  let right: SwipeAction | null = null;

  if (status === "want_to_read") {
    if (props.onStartReading) left = { label: "Start", icon: "▶", color: t.color.accent.base, action: props.onStartReading };
    if (props.onMarkDNF) right = { label: "DNF", icon: "✕", color: t.color.error.base, action: props.onMarkDNF };
  } else if (status === "reading") {
    if (props.onMarkFinished) left = { label: "Done", icon: "✓", color: t.color.success.base, action: props.onMarkFinished };
    if (props.onMarkDNF) right = { label: "DNF", icon: "✕", color: t.color.error.base, action: props.onMarkDNF };
  } else if (status === "dnf") {
    if (props.onStartReading) left = { label: "Resume", icon: "▶", color: t.color.accent.base, action: props.onStartReading };
  } else if (status === "finished") {
    if (props.onStartReading) left = { label: "Reread", icon: "↻", color: t.color.accent.base, action: props.onStartReading };
  }

  return { left, right };
}

/* ── Sub-components ───────────────────────────────── */

function ProgressBar({ percentage, currentPage, totalPages }: {
  percentage: number; currentPage: number; totalPages: number | null;
}) {
  const pct = Math.min(Math.max(percentage, 0), 100);
  return (
    <View style={c.progressOuter}>
      <View style={c.progressTrack}>
        <View style={[c.progressFill, { width: `${pct}%` }]} />
      </View>
      <View style={c.progressLabels}>
        <Text style={c.progressPct}>{Math.round(pct)}%</Text>
        {totalPages != null && totalPages > 0 && (
          <Text style={c.progressPages}>
            p.{"\u2009"}{currentPage}{"\u2009"}/{"\u2009"}{totalPages}
          </Text>
        )}
      </View>
    </View>
  );
}

function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <View style={c.starsRow}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Text key={i} style={i < full ? c.starOn : c.starOff}>★</Text>
      ))}
      <Text style={c.ratingNum}>{rating.toFixed(1)}</Text>
    </View>
  );
}

function SwipeReveal({ action }: { action: SwipeAction; side: "left" | "right" }) {
  return (
    <View style={[c.swipePane, { backgroundColor: action.color }]}>
      <Text style={c.swipeIcon}>{action.icon}</Text>
      <Text style={c.swipeLabel}>{action.label}</Text>
    </View>
  );
}

/* ── Main component ───────────────────────────────── */

export function CompactBookRow(props: CompactBookRowProps) {
  const { book, progress, onPress, onLongPress, onSwipeableWillOpen } = props;
  const swipeRef = useRef<Swipeable | null>(null);

  const status = book.entry.status;
  const pct = progress?.percentage ?? 0;
  const { left: swipeL, right: swipeR } = resolveSwipeActions(status, props);

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPress?.();
  };

  const handleSwipeOpen = (direction: "left" | "right") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    (direction === "left" ? swipeL : swipeR)?.action();
    setTimeout(() => swipeRef.current?.close(), 250);
  };

  const card = (
    <Pressable
      style={({ pressed }) => [c.glass, pressed && c.pressed]}
      onPress={onPress}
      onLongPress={onLongPress ? handleLongPress : undefined}
      delayLongPress={300}
    >
      {book.cover_url ? (
        <Image source={{ uri: book.cover_url }} style={c.cover} contentFit="cover" />
      ) : (
        <View style={[c.cover, c.coverEmpty]}>
          <Text style={c.coverEmoji}>📖</Text>
        </View>
      )}

      <View style={c.body}>
        <View style={c.titleRow}>
          <Text style={c.title} numberOfLines={1}>{book.title}</Text>
          {book.page_count != null && (
            <Text style={c.pageLabel}>{book.page_count} pg</Text>
          )}
        </View>

        <Text style={c.author} numberOfLines={1}>{book.authors ?? "Unknown author"}</Text>

        {status === "reading" && pct > 0 && (
          <ProgressBar percentage={pct} currentPage={progress?.currentPage ?? 0} totalPages={book.page_count} />
        )}

        {status === "finished" && book.entry.rating != null && (
          <Stars rating={book.entry.rating} />
        )}

        {status === "dnf" && (
          <View style={c.dnfRow}>
            <View style={c.dnfBadge}><Text style={c.dnfText}>DNF</Text></View>
            {pct > 0 && <Text style={c.dnfPct}>{Math.round(pct)}% read</Text>}
          </View>
        )}
      </View>
    </Pressable>
  );

  if (Platform.OS === "web" || (!swipeL && !swipeR)) return card;

  return (
    <Swipeable
      ref={swipeRef}
      renderLeftActions={swipeL ? (_p: Animated.AnimatedInterpolation<number>) => <SwipeReveal action={swipeL} side="left" /> : undefined}
      renderRightActions={swipeR ? (_p: Animated.AnimatedInterpolation<number>) => <SwipeReveal action={swipeR} side="right" /> : undefined}
      onSwipeableOpen={handleSwipeOpen}
      onSwipeableWillOpen={() => onSwipeableWillOpen?.(swipeRef.current!)}
      overshootLeft={false}
      overshootRight={false}
      friction={2}
    >
      {card}
    </Swipeable>
  );
}

/* ── Styles ────────────────────────────────────────── */

const c = StyleSheet.create({
  glass: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: t.space._4,
    marginVertical: 5,
    paddingHorizontal: t.space._3,
    paddingVertical: t.space._3,
    borderRadius: t.radius["3xl"],
    ...t.glass.card,
  },
  pressed: t.press.scale,

  cover: {
    width: 48,
    height: 72,
    borderRadius: t.radius.lg,
    backgroundColor: t.color.glass.bg,
  },
  coverEmpty: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 1,
    borderColor: t.color.glass.border,
  },
  coverEmoji: { fontSize: 20 },

  body: { flex: 1, marginLeft: t.space._3, justifyContent: "center" as const },

  titleRow: { flexDirection: "row" as const, alignItems: "baseline" as const },
  title: {
    flex: 1,
    color: t.color.text.primary,
    fontSize: 14,
    fontWeight: "700" as const,
    letterSpacing: -0.15,
    lineHeight: 18,
  },
  pageLabel: { ...t.font.tiny, color: t.color.text.faint, marginLeft: t.space._2 },

  author: {
    color: t.color.text.tertiary,
    fontSize: 12,
    fontWeight: "400" as const,
    marginTop: 1,
    lineHeight: 16,
  },

  progressOuter: { marginTop: t.space._2 },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: t.color.glass.border,
    overflow: "hidden" as const,
  },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: t.color.accent.base },
  progressLabels: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginTop: 3,
  },
  progressPct: { color: t.color.accent.light, fontSize: 10, fontWeight: "700" as const },
  progressPages: { ...t.font.tiny, color: t.color.text.muted },

  starsRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    marginTop: 5,
    gap: 1,
  },
  starOn: { color: t.color.warning.light, fontSize: 12 },
  starOff: { color: t.color.text.faint, fontSize: 12 },
  ratingNum: { ...t.font.tiny, color: t.color.text.muted, marginLeft: 5 },

  dnfRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    marginTop: 5,
    gap: t.space._2,
  },
  dnfBadge: {
    backgroundColor: t.color.error.bg,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: t.radius.sm,
    borderWidth: 1,
    borderColor: t.color.error.border,
  },
  dnfText: { color: t.color.error.light, fontSize: 9, fontWeight: "800" as const, letterSpacing: 0.6 },
  dnfPct: { ...t.font.tiny, color: t.color.text.muted },

  swipePane: {
    width: 80,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    borderRadius: t.radius["3xl"],
    marginVertical: 5,
  },
  swipeIcon: { color: "#fff", fontSize: 16, fontWeight: "700" as const },
  swipeLabel: { color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: "600" as const, marginTop: 2 },
});
