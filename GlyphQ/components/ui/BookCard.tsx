import { View, Text, Pressable, StyleSheet, type ViewStyle, type StyleProp } from "react-native";
import { Image } from "expo-image";
import { t } from "@/theme";
import type { BookWithEntry } from "@/store/libraryStore";

/* ── Props ─────────────────────────────────────────── */

export interface BookCardProgress {
  currentPage: number;
  percentage: number;
}

export interface BookCardProps {
  book: BookWithEntry;
  progress?: BookCardProgress;
  onStartReading?: () => void;
  onMarkFinished?: () => void;
  onMarkDNF?: () => void;
  onOpenReader?: () => void;
  onPress?: () => void;
  hideActions?: boolean;
  style?: StyleProp<ViewStyle>;
}

/* ── Action themes ─────────────────────────────────── */

const PILL = {
  default: { bg: t.color.glass.bgHover, fg: t.color.text.secondary },
  primary: { bg: t.color.accent.bg, fg: t.color.accent.lighter },
  success: { bg: t.color.success.bg, fg: t.color.success.lighter },
  danger: { bg: t.color.error.bg, fg: t.color.error.light },
} as const;

type PillVariant = keyof typeof PILL;

/* ── Sub-components ────────────────────────────────── */

function ActionPill({ icon, label, variant = "default", onPress }: {
  icon: string; label: string; variant?: PillVariant; onPress: () => void;
}) {
  const { bg, fg } = PILL[variant];
  return (
    <Pressable style={[g.pill, { backgroundColor: bg }]} onPress={onPress}>
      <Text style={[g.pillIcon, { color: fg }]}>{icon}</Text>
      <Text style={[g.pillLabel, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <View style={g.starsRow}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Text key={i} style={i < full ? g.starOn : g.starOff}>★</Text>
      ))}
      <Text style={g.ratingNum}>{rating.toFixed(1)}</Text>
    </View>
  );
}

function ProgressIndicator({ percentage, currentPage, totalPages }: {
  percentage: number; currentPage: number; totalPages: number | null;
}) {
  const pct = Math.min(Math.max(percentage, 0), 100);
  return (
    <View style={g.progressWrap}>
      <View style={g.progressTrack}>
        <View style={[g.progressFill, { width: `${pct}%` }]} />
      </View>
      <View style={g.progressMeta}>
        <Text style={g.progressPct}>{Math.round(pct)}%</Text>
        {totalPages != null && (
          <Text style={g.progressPages}>p. {currentPage} / {totalPages}</Text>
        )}
      </View>
    </View>
  );
}

/* ── BookCard ──────────────────────────────────────── */

export function BookCard({
  book, progress, onStartReading, onMarkFinished, onMarkDNF,
  onOpenReader, onPress, hideActions, style,
}: BookCardProps) {
  const { entry } = book;
  const status = entry.status;
  const pct = progress?.percentage ?? 0;

  const content = (
    <View style={[g.glass, style]}>
      <View style={g.row}>
        {book.cover_url ? (
          <Image source={{ uri: book.cover_url }} style={g.cover} contentFit="cover" />
        ) : (
          <View style={[g.cover, g.coverEmpty]}>
            <Text style={g.coverEmoji}>📖</Text>
          </View>
        )}

        <View style={g.info}>
          <View>
            <Text style={g.title} numberOfLines={2}>{book.title}</Text>
            <Text style={g.author} numberOfLines={1}>{book.authors ?? "Unknown author"}</Text>

            <View style={g.metaRow}>
              {book.page_count != null && (
                <View style={g.metaChip}><Text style={g.metaChipText}>{book.page_count} pg</Text></View>
              )}
              {book.published_year != null && (
                <View style={g.metaChip}><Text style={g.metaChipText}>{book.published_year}</Text></View>
              )}
              {book.series != null && (
                <View style={[g.metaChip, g.metaChipSeries]}>
                  <Text style={g.metaChipSeriesText} numberOfLines={1}>
                    {book.series}{book.series_index ? ` #${book.series_index}` : ""}
                  </Text>
                </View>
              )}
            </View>

            {(status === "reading" || (status === "dnf" && pct > 0)) && (
              <ProgressIndicator percentage={pct} currentPage={progress?.currentPage ?? 0} totalPages={book.page_count} />
            )}

            {status === "finished" && entry.rating != null && (
              <View style={g.ratingWrap}><Stars rating={entry.rating} /></View>
            )}

            {status === "dnf" && (
              <View style={g.dnfRow}>
                <View style={g.dnfBadge}><Text style={g.dnfBadgeText}>DNF</Text></View>
              </View>
            )}
          </View>

          {!hideActions && (
            <View style={g.actions}>
              {status === "want_to_read" && onStartReading && (
                <ActionPill icon="▶" label="Start Reading" variant="primary" onPress={onStartReading} />
              )}
              {status === "reading" && (
                <>
                  {onMarkFinished && <ActionPill icon="✓" label="Finished" variant="success" onPress={onMarkFinished} />}
                  {onMarkDNF && <ActionPill icon="✕" label="DNF" variant="danger" onPress={onMarkDNF} />}
                </>
              )}
              {status === "dnf" && onStartReading && (
                <ActionPill icon="▶" label="Resume" variant="primary" onPress={onStartReading} />
              )}
              {onOpenReader && <ActionPill icon="📖" label="Reader" onPress={onOpenReader} />}
            </View>
          )}
        </View>
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => pressed && g.pressed}>
        {content}
      </Pressable>
    );
  }
  return content;
}

/* ── Styles ────────────────────────────────────────── */

const g = StyleSheet.create({
  glass: {
    ...t.glass.cardElevated,
    borderRadius: t.radius["4xl"],
    padding: t.space._4 - 2,
    marginHorizontal: t.space._4,
    marginBottom: t.space._3,
  },
  pressed: t.press.scale,

  row: { flexDirection: "row" },

  cover: {
    width: 76,
    height: 114,
    borderRadius: t.radius["2xl"],
    backgroundColor: t.color.glass.bg,
  },
  coverEmpty: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: t.color.glass.border,
  },
  coverEmoji: { fontSize: 30 },

  info: { flex: 1, marginLeft: t.space._4 - 2, justifyContent: "space-between" },
  title: { ...t.font.headline, lineHeight: 20 },
  author: { ...t.font.caption, color: t.color.text.secondary, marginTop: 2 },

  metaRow: { flexDirection: "row", flexWrap: "wrap", marginTop: t.space._2, gap: 5 },
  metaChip: {
    backgroundColor: t.color.glass.bgHover,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: t.radius.sm,
  },
  metaChipText: { ...t.font.tiny, color: t.color.text.tertiary },
  metaChipSeries: { backgroundColor: t.color.accent.bg },
  metaChipSeriesText: { ...t.font.tiny, color: "rgba(165,180,252,0.8)" },

  progressWrap: { marginTop: t.space._3 },
  progressTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: t.color.glass.border,
    overflow: "hidden",
  },
  progressFill: { height: 5, borderRadius: 3, backgroundColor: t.color.accent.base },
  progressMeta: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginTop: t.space._1,
  },
  progressPct: { color: t.color.accent.light, fontSize: 10, fontWeight: "700" },
  progressPages: { ...t.font.tiny, color: t.color.text.muted },

  ratingWrap: { marginTop: t.space._2 },
  starsRow: { flexDirection: "row", alignItems: "center", gap: 1 },
  starOn: { color: t.color.warning.light, fontSize: 13 },
  starOff: { color: t.color.border.strong, fontSize: 13 },
  ratingNum: { ...t.font.tiny, color: t.color.text.tertiary, marginLeft: 5 },

  dnfRow: { flexDirection: "row", alignItems: "center", marginTop: t.space._2 },
  dnfBadge: {
    backgroundColor: t.color.error.bg,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.color.error.border,
  },
  dnfBadgeText: { color: t.color.error.light, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },

  actions: { flexDirection: "row", flexWrap: "wrap", gap: t.space._2, marginTop: t.space._3 },
  pill: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: t.space._3, paddingVertical: t.space._2,
    borderRadius: t.radius.md,
  },
  pillIcon: { fontSize: 11, marginRight: t.space._1 },
  pillLabel: { fontSize: 11, fontWeight: "600" },
});
