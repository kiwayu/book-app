import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from "react-native";
import { t } from "@/theme";
import type { BookStatus, Tag } from "@/store/libraryStore";

/* ── Filter types ─────────────────────────────────── */

export interface LibraryFilters {
  status: BookStatus[];
  genres: string[];
  authors: string[];
  pageRange: [number, number] | null;
  minRating: number | null;
  tagIds: number[];
}

export const EMPTY_FILTERS: LibraryFilters = {
  status: [], genres: [], authors: [], pageRange: null, minRating: null, tagIds: [],
};

export function countActiveFilters(f: LibraryFilters): number {
  let n = 0;
  if (f.status.length) n++;
  if (f.genres.length) n++;
  if (f.authors.length) n++;
  if (f.pageRange) n++;
  if (f.minRating != null) n++;
  if (f.tagIds.length) n++;
  return n;
}

/* ── Constants ────────────────────────────────────── */

const STATUS_LABELS: Record<BookStatus, string> = {
  reading: "Reading",
  want_to_read: "Want to Read",
  finished: "Finished",
  dnf: "DNF",
};

const PAGE_RANGES: { label: string; range: [number, number] }[] = [
  { label: "Short (<200)", range: [0, 199] },
  { label: "Medium (200–400)", range: [200, 400] },
  { label: "Long (400–600)", range: [400, 600] },
  { label: "Epic (600+)", range: [600, 99999] },
];

/* ── Chip ─────────────────────────────────────────── */

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[chip.root, active && chip.active]} onPress={onPress}>
      <Text style={[chip.text, active && chip.textActive]}>{label}</Text>
    </Pressable>
  );
}

/* ── FilterSheet ──────────────────────────────────── */

interface FilterSheetProps {
  visible: boolean;
  filters: LibraryFilters;
  onChange: (f: LibraryFilters) => void;
  onApply: () => void;
  onClear: () => void;
  onClose: () => void;
  uniqueGenres: string[];
  uniqueAuthors: string[];
  tags: Tag[];
}

export function FilterSheet({
  visible, filters, onChange, onApply, onClear, onClose,
  uniqueGenres, uniqueAuthors, tags,
}: FilterSheetProps) {
  const toggle = <T,>(list: T[], item: T) =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  const activeCount = countActiveFilters(filters);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={fs.overlay} onPress={onClose}>
        <Pressable style={fs.sheet} onPress={() => {}}>
          <View style={fs.handle} />

          <View style={fs.header}>
            <Text style={fs.title}>Filters</Text>
            {activeCount > 0 && (
              <Pressable onPress={onClear} hitSlop={8}>
                <Text style={fs.clearText}>Clear All</Text>
              </Pressable>
            )}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={fs.body}>
            <Text style={fs.groupLabel}>Status</Text>
            <View style={fs.chipRow}>
              {(Object.keys(STATUS_LABELS) as BookStatus[]).map((st) => (
                <Chip key={st} label={STATUS_LABELS[st]} active={filters.status.includes(st)}
                  onPress={() => onChange({ ...filters, status: toggle(filters.status, st) })} />
              ))}
            </View>

            <Text style={fs.groupLabel}>Minimum Rating</Text>
            <View style={fs.chipRow}>
              {[1, 2, 3, 4, 5].map((r) => (
                <Chip key={r} label={`${"★".repeat(r)}+`} active={filters.minRating === r}
                  onPress={() => onChange({ ...filters, minRating: filters.minRating === r ? null : r })} />
              ))}
            </View>

            <Text style={fs.groupLabel}>Page Count</Text>
            <View style={fs.chipRow}>
              {PAGE_RANGES.map((pr) => {
                const match = !!filters.pageRange && filters.pageRange[0] === pr.range[0] && filters.pageRange[1] === pr.range[1];
                return (
                  <Chip key={pr.label} label={pr.label} active={match}
                    onPress={() => onChange({ ...filters, pageRange: match ? null : pr.range })} />
                );
              })}
            </View>

            {uniqueGenres.length > 0 && (
              <>
                <Text style={fs.groupLabel}>Genre</Text>
                <View style={fs.chipRow}>
                  {uniqueGenres.map((g) => (
                    <Chip key={g} label={g} active={filters.genres.includes(g)}
                      onPress={() => onChange({ ...filters, genres: toggle(filters.genres, g) })} />
                  ))}
                </View>
              </>
            )}

            {uniqueAuthors.length > 0 && (
              <>
                <Text style={fs.groupLabel}>Author</Text>
                <View style={fs.chipRow}>
                  {uniqueAuthors.map((a) => (
                    <Chip key={a} label={a} active={filters.authors.includes(a)}
                      onPress={() => onChange({ ...filters, authors: toggle(filters.authors, a) })} />
                  ))}
                </View>
              </>
            )}

            {tags.length > 0 && (
              <>
                <Text style={fs.groupLabel}>Tags</Text>
                <View style={fs.chipRow}>
                  {tags.map((tg) => (
                    <Chip key={tg.id} label={tg.name} active={filters.tagIds.includes(tg.id)}
                      onPress={() => onChange({ ...filters, tagIds: toggle(filters.tagIds, tg.id) })} />
                  ))}
                </View>
              </>
            )}

            <View style={{ height: t.space._5 }} />
          </ScrollView>

          <View style={fs.footer}>
            <Pressable style={fs.applyBtn} onPress={onApply}>
              <Text style={fs.applyText}>
                {activeCount > 0 ? `Apply ${activeCount} Filter${activeCount > 1 ? "s" : ""}` : "Done"}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ── Styles ────────────────────────────────────────── */

const chip = StyleSheet.create({
  root: {
    paddingHorizontal: t.space._3,
    paddingVertical: t.space._2 - 2,
    borderRadius: t.radius.md,
    backgroundColor: t.color.bg.overlay,
    borderWidth: 1,
    borderColor: t.color.border.default,
  },
  active: {
    backgroundColor: t.color.accent.bg,
    borderColor: t.color.accent.base,
  },
  text: {
    ...t.font.caption,
    color: t.color.text.secondary,
  },
  textActive: {
    color: t.color.accent.lighter,
  },
});

const fs = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(56,73,89,0.52)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: t.color.bg.raised,
    borderTopLeftRadius: t.radius["5xl"],
    borderTopRightRadius: t.radius["5xl"],
    maxHeight: "80%",
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: t.color.border.default,
    ...t.shadow.top,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: t.color.border.strong,
    alignSelf: "center",
    marginTop: t.space._3,
    marginBottom: t.space._2,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: t.space._5,
    paddingVertical: t.space._3,
  },
  title: { ...t.font.title },
  clearText: {
    color: t.color.error.base,
    fontSize: 13,
    fontWeight: "600",
  },

  body: { paddingHorizontal: t.space._5 },
  groupLabel: {
    ...t.font.label,
    marginTop: t.space._4,
    marginBottom: t.space._2,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: t.space._2 - 2,
  },

  footer: {
    paddingHorizontal: t.space._5,
    paddingTop: t.space._3,
    paddingBottom: t.space._8,
  },
  applyBtn: {
    backgroundColor: t.color.accent.strong,
    borderRadius: t.radius["2xl"],
    paddingVertical: t.space._4 - 2,
    alignItems: "center",
  },
  applyText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
