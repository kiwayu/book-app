import { View, Text, FlatList, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { t } from "@/theme";
import type { BookCardProgress } from "./BookCard";

export interface CoverShelfBook {
  id: number;
  title: string;
  authors: string | null;
  cover_url: string | null;
  status?: string;
}

/* ── CoverShelfItem ───────────────────────────────── */

function CoverShelfItem({ item, progress, onPress, onLongPress, accent }: {
  item: CoverShelfBook;
  progress?: BookCardProgress;
  onPress: () => void;
  onLongPress?: () => void;
  accent?: boolean;
}) {
  const pct = progress?.percentage ?? 0;
  const isFinished = item.status === "finished";

  return (
    <Pressable
      style={({ pressed }) => [cs.item, accent && cs.itemAccent, pressed && cs.itemPressed]}
      onPress={onPress} onLongPress={onLongPress} delayLongPress={300}>
      <View>
        {item.cover_url ? (
          <Image source={{ uri: item.cover_url }} style={[cs.cover, accent && cs.coverAccent]} contentFit="cover" />
        ) : (
          <View style={[cs.cover, accent && cs.coverAccent, cs.coverEmpty]}>
            <Text style={cs.coverEmoji}>📖</Text>
          </View>
        )}

        {pct > 0 && pct < 100 && (
          <View style={cs.progressOverlay}>
            <View style={cs.progressTrack}>
              <View style={[cs.progressFill, { width: `${Math.min(pct, 100)}%` }]} />
            </View>
          </View>
        )}

        {isFinished && (
          <View style={cs.doneBadge}>
            <Text style={cs.doneBadgeText}>✓</Text>
          </View>
        )}
      </View>

      <Text style={cs.title} numberOfLines={2}>{item.title}</Text>
      <Text style={cs.author} numberOfLines={1}>{item.authors ?? "Unknown"}</Text>
      {pct > 0 && pct < 100 && (
        <Text style={cs.pctLabel}>{Math.round(pct)}%</Text>
      )}
    </Pressable>
  );
}

/* ── CoverShelf ───────────────────────────────────── */

interface CoverShelfProps {
  title: string;
  data: CoverShelfBook[];
  progressMap?: Map<number, BookCardProgress>;
  onPress: (id: number) => void;
  onLongPress?: (id: number) => void;
  /** Elevates visual treatment — use for the primary/hero shelf */
  accent?: boolean;
  onSeeAll?: () => void;
}

export function CoverShelf({ title, data, progressMap, onPress, onLongPress, accent, onSeeAll }: CoverShelfProps) {
  if (data.length === 0) return null;

  return (
    <View style={[cs.container, accent && cs.containerAccent]}>
      <View style={cs.headingRow}>
        <Text style={[cs.heading, accent && cs.headingAccent]}>{title}</Text>
        {onSeeAll && (
          <Pressable onPress={onSeeAll} hitSlop={8}>
            <Text style={cs.seeAllText}>See all</Text>
          </Pressable>
        )}
      </View>
      <FlatList
        data={data}
        keyExtractor={(item) => String(item.id)}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={cs.list}
        renderItem={({ item }) => (
          <CoverShelfItem
            item={item}
            progress={progressMap?.get(item.id)}
            onPress={() => onPress(item.id)}
            onLongPress={onLongPress ? () => onLongPress(item.id) : undefined}
            accent={accent}
          />
        )}
      />
    </View>
  );
}

/* ── Styles ────────────────────────────────────────── */

const cs = StyleSheet.create({
  container: { marginTop: t.space._3, marginBottom: t.space._1 },
  containerAccent: {
    backgroundColor: "rgba(136,189,242,0.07)",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(136,189,242,0.18)",
    paddingTop: t.space._3,
    paddingBottom: t.space._1,
    marginTop: t.space._2,
  },

  headingRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: t.space._5,
    marginBottom: t.space._3,
  },
  heading: {
    ...t.font.headline,
  },
  headingAccent: {
    fontSize: 17,
    fontWeight: "800" as const,
    letterSpacing: -0.3,
    color: t.color.text.primary,
  },
  seeAllText: {
    color: t.color.accent.base,
    fontSize: 13,
    fontWeight: "600" as const,
  },
  list: { paddingHorizontal: t.space._4 },
  item: { width: 110, marginRight: t.space._3, alignItems: "flex-start" as const },
  itemAccent: { width: 124 },
  itemPressed: t.press.scale,

  cover: {
    width: 110,
    height: 164,
    borderRadius: t.radius["2xl"],
    backgroundColor: t.color.glass.bg,
    ...t.shadow.medium,
  },
  coverAccent: {
    width: 124,
    height: 186,
    borderRadius: t.radius["3xl"],
  },
  coverEmpty: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 1,
    borderColor: t.color.glass.border,
  },
  coverEmoji: { fontSize: 36 },

  progressOverlay: {
    position: "absolute" as const,
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: t.space._2,
    paddingBottom: t.space._2,
  },
  progressTrack: {
    height: 4, borderRadius: 2,
    backgroundColor: "rgba(56,73,89,0.28)",
    overflow: "hidden" as const,
  },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: t.color.accent.light },

  doneBadge: {
    position: "absolute" as const,
    top: t.space._2, right: t.space._2,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "rgba(16,185,129,0.9)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  doneBadgeText: { color: "#fff", fontSize: 12, fontWeight: "800" as const },

  title: { ...t.font.caption, color: t.color.text.primary, marginTop: t.space._2, lineHeight: 16 },
  author: { ...t.font.tiny, color: t.color.text.tertiary, marginTop: 2 },
  pctLabel: { color: t.color.accent.light, fontSize: 10, fontWeight: "700" as const, marginTop: 3 },
});
