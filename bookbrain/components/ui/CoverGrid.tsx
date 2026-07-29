import { View, Text, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { ResponsiveGrid } from "./ResponsiveGrid";
import { IconSymbol } from "./icon-symbol";
import { t } from "@/theme";
import type { BookCardProgress } from "./BookCard";
import type { CoverShelfBook } from "./CoverShelf";

/* Bookstore-style grid: front cover first, title + author beneath. Reuses the
   CoverShelf tile look but sizes each cover to its grid cell (aspect 2:3). */

function GridItem({ item, progress, onPress, onLongPress }: {
  item: CoverShelfBook;
  progress?: BookCardProgress;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const pct = progress?.percentage ?? 0;
  const isFinished = item.status === "finished";

  return (
    <Pressable
      style={({ pressed }) => [gi.item, pressed && t.press.scale]}
      onPress={onPress} onLongPress={onLongPress} delayLongPress={300}
    >
      <View>
        {item.cover_url ? (
          <Image source={{ uri: item.cover_url }} style={gi.cover} contentFit="cover" />
        ) : (
          <View style={[gi.cover, gi.coverEmpty]}>
            <IconSymbol name="book.closed.fill" size={30} color={t.color.text.faint} />
          </View>
        )}

        {pct > 0 && pct < 100 && (
          <View style={gi.progressOverlay}>
            <View style={gi.progressTrack}>
              <View style={[gi.progressFill, { width: `${Math.min(pct, 100)}%` }]} />
            </View>
          </View>
        )}

        {isFinished && (
          <View style={gi.doneBadge}><Text style={gi.doneBadgeText}>✓</Text></View>
        )}
      </View>

      <Text style={gi.title} numberOfLines={2}>{item.title}</Text>
      <Text style={gi.author} numberOfLines={1}>{item.authors ?? "Unknown"}</Text>
    </Pressable>
  );
}

export function CoverGrid({ data, progressMap, onPress, onLongPress }: {
  data: CoverShelfBook[];
  progressMap?: Map<number, BookCardProgress>;
  onPress: (id: number) => void;
  onLongPress?: (id: number) => void;
}) {
  return (
    <ResponsiveGrid mobileColumns={3} tabletColumns={4} desktopColumns={6}
      gap={t.space._3} style={gi.grid}>
      {data.map((item) => (
        <GridItem key={item.id} item={item} progress={progressMap?.get(item.id)}
          onPress={() => onPress(item.id)}
          onLongPress={onLongPress ? () => onLongPress(item.id) : undefined} />
      ))}
    </ResponsiveGrid>
  );
}

const gi = StyleSheet.create({
  grid: { paddingHorizontal: t.space._4, marginTop: t.space._2 },
  item: { width: "100%", marginBottom: t.space._4 },
  cover: {
    width: "100%",
    aspectRatio: 2 / 3,
    borderRadius: t.radius.xl,
    backgroundColor: t.color.glass.bg,
    ...t.shadow.medium,
  },
  coverEmpty: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: t.color.glass.border,
  },
  progressOverlay: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingHorizontal: t.space._2, paddingBottom: t.space._2,
  },
  progressTrack: {
    height: 4, borderRadius: 2,
    backgroundColor: "rgba(56,73,89,0.28)", overflow: "hidden",
  },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: t.color.accent.light },
  doneBadge: {
    position: "absolute", top: t.space._2, right: t.space._2,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: "rgba(16,185,129,0.9)",
    alignItems: "center", justifyContent: "center",
  },
  doneBadgeText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  title: { ...t.font.caption, color: t.color.text.primary, marginTop: t.space._2, lineHeight: 16 },
  author: { ...t.font.tiny, color: t.color.text.tertiary, marginTop: 2 },
});
