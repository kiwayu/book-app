import { useState, useEffect, useCallback } from "react";
import {
  View, Text, Pressable, Modal, ScrollView, StyleSheet, Alert,
  Image, TextInput, ActivityIndicator,
} from "react-native";
import { t } from "@/theme";
import { IconSymbol } from "@/components/ui/icon-symbol";
import type { BookWithEntry } from "@/store/libraryStore";
import type { BookCardProgress } from "./BookCard";
import { getHighlightsForBook, getNotesForBook, addNote, type Highlight, type BookNote } from "@/services/highlights";
import { getBookmarksForBook, type Bookmark } from "@/services/bookmarks";
import { getProgress, type ReadingProgress } from "@/services/readingTracker";
import { getAll } from "@/db/database";

/* ── Types ──────────────────────────────────────── */

interface ActionDef {
  icon: string;
  label: string;
  color: string;
  bg: string;
  onPress: () => void;
}

interface ReadingSessionRow {
  id: number;
  book_id: number;
  start_time: string;
  end_time: string | null;
  pages_read: number;
}

type TabKey = "overview" | "progress" | "notes" | "highlights";

export interface BookDetailSheetProps {
  book: BookWithEntry | null;
  progress?: BookCardProgress;
  visible: boolean;
  onClose: () => void;
  onStartReading?: (bookId: number) => void;
  onMarkFinished?: (bookId: number) => void;
  onMarkDNF?: (bookId: number) => void;
  onOpenReader?: (bookId: number) => void;
  onDeleteBook?: (bookId: number) => void;
}

/* ── Inline Tab Bar ─────────────────────────────── */

function TabBar({ tabs, active, onSelect }: {
  tabs: { key: string; label: string; count?: number }[];
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <View style={ds.tabBar}>
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Pressable key={tab.key} style={[ds.tab, isActive && ds.tabActive]} onPress={() => onSelect(tab.key)}>
            <Text style={[ds.tabText, isActive && ds.tabTextActive]}>
              {tab.label}
              {tab.count ? ` (${tab.count})` : ""}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ── Timeline Component ─────────────────────────── */

function Timeline({ events }: { events: { label: string; date: string | null; active?: boolean }[] }) {
  const visible = events.filter(e => e.date);
  return (
    <View style={ds.timeline}>
      {visible.map((event, i) => (
        <View key={i} style={ds.timelineItem}>
          <View style={ds.timelineDotContainer}>
            <View style={[ds.timelineDot, event.active && ds.timelineDotActive]} />
            {i < visible.length - 1 && <View style={ds.timelineLine} />}
          </View>
          <View style={ds.timelineContent}>
            <Text style={ds.timelineLabel}>{event.label}</Text>
            <Text style={ds.timelineDate}>
              {new Date(event.date!).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/* ── Status helpers ─────────────────────────────── */

function getStatusInfo(status: string): { label: string; color: string; bg: string } {
  switch (status) {
    case "want_to_read":
      return { label: "Want to Read", color: t.color.accent.base, bg: t.color.accent.bg };
    case "reading":
      return { label: "Reading", color: t.color.success.base, bg: t.color.success.bg };
    case "finished":
      return { label: "Finished", color: t.color.accent.strong, bg: t.color.accent.bgStrong };
    case "dnf":
      return { label: "Did Not Finish", color: t.color.error.base, bg: t.color.error.bg };
    default:
      return { label: status, color: t.color.text.tertiary, bg: t.color.accent.bg };
  }
}

/* ── Main Component ─────────────────────────────── */

export function BookDetailSheet({
  book, progress, visible, onClose,
  onStartReading, onMarkFinished, onMarkDNF, onOpenReader, onDeleteBook,
}: BookDetailSheetProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [notes, setNotes] = useState<BookNote[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [readingProgress, setReadingProgress] = useState<ReadingProgress | null>(null);
  const [sessions, setSessions] = useState<ReadingSessionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  const [showNoteInput, setShowNoteInput] = useState(false);

  // Load data when visible and book changes
  useEffect(() => {
    if (!visible || !book) {
      setActiveTab("overview");
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const [hl, nt, bm, prog, sess] = await Promise.all([
          getHighlightsForBook(book.id),
          getNotesForBook(book.id),
          getBookmarksForBook(book.id),
          getProgress(book.id),
          getAll<ReadingSessionRow>(
            "SELECT * FROM reading_sessions WHERE book_id = ? AND end_time IS NOT NULL ORDER BY start_time DESC",
            [book.id]
          ),
        ]);
        if (cancelled) return;
        setHighlights(hl);
        setNotes(nt);
        setBookmarks(bm);
        setReadingProgress(prog);
        setSessions(sess);
      } catch {
        // Silently fail — tabs will show empty state
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [visible, book?.id]);

  const handleAddNote = useCallback(async () => {
    if (!book || !newNoteText.trim()) return;
    try {
      await addNote(book.id, newNoteText.trim());
      const updated = await getNotesForBook(book.id);
      setNotes(updated);
      setNewNoteText("");
      setShowNoteInput(false);
    } catch {
      Alert.alert("Error", "Failed to add note.");
    }
  }, [book, newNoteText]);

  if (!book) return null;
  // Non-null alias for use in nested render functions (TS can't narrow through closures)
  const b = book;

  const status = b.entry.status;
  const statusInfo = getStatusInfo(status);

  // ── Action buttons (same logic as original) ──
  const actions: ActionDef[] = [];

  if (status === "want_to_read" && onStartReading) {
    actions.push({ icon: "▶", label: "Start Reading", color: t.color.accent.lighter, bg: t.color.accent.bg, onPress: () => onStartReading(b.id) });
  }
  if (status === "reading" && onMarkFinished) {
    actions.push({ icon: "✓", label: "Mark Finished", color: t.color.success.lighter, bg: t.color.success.bg, onPress: () => onMarkFinished(b.id) });
  }
  if ((status === "dnf" || status === "finished") && onStartReading) {
    actions.push({ icon: "▶", label: status === "dnf" ? "Resume Reading" : "Reread", color: t.color.accent.lighter, bg: t.color.accent.bg, onPress: () => onStartReading(b.id) });
  }
  if (onOpenReader) {
    actions.push({ icon: "📖", label: "Open in Reader", color: t.color.text.secondary, bg: t.color.glass.bgHover, onPress: () => onOpenReader(b.id) });
  }
  if (status === "reading" && onMarkDNF) {
    actions.push({ icon: "✕", label: "Did Not Finish", color: t.color.error.light, bg: t.color.error.bg, onPress: () => onMarkDNF(b.id) });
  }

  const handleDelete = onDeleteBook
    ? () => {
        Alert.alert(
          "Remove from Library",
          `Remove "${b.title}" from your library? This cannot be undone.`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Remove",
              style: "destructive",
              onPress: () => { onDeleteBook(b.id); onClose(); },
            },
          ]
        );
      }
    : undefined;

  // ── Tab definitions ──
  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "progress", label: "Progress" },
    { key: "notes", label: "Notes", count: notes.length || undefined },
    { key: "highlights", label: "Highlights", count: highlights.length || undefined },
  ];

  // ── Session stats ──
  const totalSessions = sessions.length;
  const totalHours = sessions.reduce((sum, s) => {
    if (!s.end_time) return sum;
    const dur = new Date(s.end_time).getTime() - new Date(s.start_time).getTime();
    return sum + dur / (1000 * 60 * 60);
  }, 0);
  const totalPages = sessions.reduce((sum, s) => sum + s.pages_read, 0);
  const avgPagesPerSession = totalSessions > 0 ? Math.round(totalPages / totalSessions) : 0;

  // ── Genre tags ──
  const genres: string[] = b.genres ? b.genres.split(",").map(g => g.trim()).filter(Boolean) : [];

  // ── Progress percentage ──
  const pct = readingProgress?.percentage ?? progress?.percentage ?? 0;
  const currentPage = readingProgress?.current_page ?? 0;

  /* ── Render Tabs ──────────────────────────────── */

  function renderOverview() {
    return (
      <View style={ds.tabContent}>
        {/* Metadata */}
        <View style={ds.metaSection}>
          {b.publisher && (
            <View style={ds.metaRow}>
              <Text style={ds.metaLabel}>Publisher</Text>
              <Text style={ds.metaValue}>{b.publisher}</Text>
            </View>
          )}
          {b.published_year && (
            <View style={ds.metaRow}>
              <Text style={ds.metaLabel}>Published</Text>
              <Text style={ds.metaValue}>{b.published_year}</Text>
            </View>
          )}
          {b.isbn && (
            <View style={ds.metaRow}>
              <Text style={ds.metaLabel}>ISBN</Text>
              <Text style={ds.metaValue}>{b.isbn}</Text>
            </View>
          )}
          {b.page_count && (
            <View style={ds.metaRow}>
              <Text style={ds.metaLabel}>Pages</Text>
              <Text style={ds.metaValue}>{b.page_count}</Text>
            </View>
          )}
        </View>

        {/* Genre tags */}
        {genres.length > 0 && (
          <View style={ds.genreContainer}>
            {genres.map((genre) => (
              <View key={genre} style={ds.genreTag}>
                <Text style={ds.genreText}>{genre}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Description */}
        {b.description && (
          <Pressable onPress={() => setDescExpanded(!descExpanded)} style={ds.descSection}>
            <Text style={ds.descText} numberOfLines={descExpanded ? undefined : 3}>
              {b.description}
            </Text>
            <Text style={ds.descToggle}>{descExpanded ? "Show less" : "Show more"}</Text>
          </Pressable>
        )}

        {/* Series info */}
        {b.series && (
          <View style={ds.seriesRow}>
            <IconSymbol name="books.vertical" size={14} color={t.color.text.tertiary} />
            <Text style={ds.seriesText}>
              {b.series}{b.series_index != null ? ` #${b.series_index}` : ""}
            </Text>
          </View>
        )}

        {/* Action buttons */}
        <View style={ds.actions}>
          {actions.map((a) => (
            <Pressable
              key={a.label}
              style={[ds.actionBtn, { backgroundColor: a.bg }]}
              onPress={() => { a.onPress(); onClose(); }}
            >
              <Text style={[ds.actionIcon, { color: a.color }]}>{a.icon}</Text>
              <Text style={[ds.actionLabel, { color: a.color }]}>{a.label}</Text>
            </Pressable>
          ))}
          {handleDelete && (
            <Pressable style={[ds.actionBtn, ds.deleteBtn]} onPress={handleDelete}>
              <Text style={[ds.actionIcon, ds.deleteIcon]}>🗑</Text>
              <Text style={[ds.actionLabel, ds.deleteLabel]}>Remove from Library</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  function renderProgress() {
    return (
      <View style={ds.tabContent}>
        {/* Progress bar */}
        <View style={ds.progressSection}>
          <View style={ds.progressHeader}>
            <Text style={ds.progressPct}>{Math.round(pct)}%</Text>
            {b.page_count ? (
              <Text style={ds.progressPages}>
                {currentPage} / {b.page_count} pages
              </Text>
            ) : null}
          </View>
          <View style={ds.progressBarBg}>
            <View style={[ds.progressBarFill, { width: `${Math.min(pct, 100)}%` as any }]} />
          </View>
        </View>

        {/* Reading timeline */}
        <Text style={ds.sectionTitle}>Reading Timeline</Text>
        <Timeline
          events={[
            { label: "Added to Library", date: b.entry.date_added, active: true },
            { label: "Started Reading", date: b.entry.started_at, active: status === "reading" },
            { label: "Finished", date: b.entry.finished_at, active: status === "finished" },
          ]}
        />

        {/* Session stats */}
        {totalSessions > 0 && (
          <>
            <Text style={ds.sectionTitle}>Reading Sessions</Text>
            <View style={ds.statsGrid}>
              <View style={ds.statCard}>
                <Text style={ds.statValue}>{totalSessions}</Text>
                <Text style={ds.statLabel}>Sessions</Text>
              </View>
              <View style={ds.statCard}>
                <Text style={ds.statValue}>{totalHours.toFixed(1)}</Text>
                <Text style={ds.statLabel}>Hours</Text>
              </View>
              <View style={ds.statCard}>
                <Text style={ds.statValue}>{avgPagesPerSession}</Text>
                <Text style={ds.statLabel}>Pages/Session</Text>
              </View>
            </View>
          </>
        )}

        {/* Reread count */}
        {b.entry.reread_count > 0 && (
          <View style={ds.rereadRow}>
            <IconSymbol name="arrow.counterclockwise" size={14} color={t.color.accent.base} />
            <Text style={ds.rereadText}>
              Reread {b.entry.reread_count} time{b.entry.reread_count > 1 ? "s" : ""}
            </Text>
          </View>
        )}

        {totalSessions === 0 && !b.entry.started_at && (
          <View style={ds.emptyState}>
            <Text style={ds.emptyText}>No reading sessions yet. Start reading to track your progress.</Text>
          </View>
        )}
      </View>
    );
  }

  function renderNotes() {
    return (
      <View style={ds.tabContent}>
        {notes.length > 0 ? (
          notes.map((note) => (
            <View key={note.id} style={ds.noteCard}>
              <Text style={ds.noteContent}>{note.content}</Text>
              <View style={ds.noteFooter}>
                {note.page_ref != null && (
                  <Text style={ds.notePage}>p. {note.page_ref}</Text>
                )}
                <Text style={ds.noteDate}>
                  {new Date(note.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </Text>
              </View>
            </View>
          ))
        ) : !showNoteInput ? (
          <View style={ds.emptyState}>
            <IconSymbol name="note.text" size={28} color={t.color.text.muted} />
            <Text style={ds.emptyText}>No notes yet. Add notes while reading.</Text>
          </View>
        ) : null}

        {/* Inline add note */}
        {showNoteInput ? (
          <View style={ds.addNoteContainer}>
            <TextInput
              style={ds.noteInput}
              placeholder="Write a note..."
              placeholderTextColor={t.color.text.muted}
              value={newNoteText}
              onChangeText={setNewNoteText}
              multiline
              autoFocus
            />
            <View style={ds.noteInputActions}>
              <Pressable style={ds.noteInputCancel} onPress={() => { setShowNoteInput(false); setNewNoteText(""); }}>
                <Text style={ds.noteInputCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[ds.noteInputSave, !newNoteText.trim() && ds.noteInputSaveDisabled]}
                onPress={handleAddNote}
                disabled={!newNoteText.trim()}
              >
                <Text style={ds.noteInputSaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={ds.addNoteBtn} onPress={() => setShowNoteInput(true)}>
            <IconSymbol name="plus.circle" size={18} color={t.color.accent.base} />
            <Text style={ds.addNoteBtnText}>Add Note</Text>
          </Pressable>
        )}
      </View>
    );
  }

  function renderHighlights() {
    return (
      <View style={ds.tabContent}>
        {bookmarks.length > 0 && (
          <View style={ds.bookmarkCountRow}>
            <IconSymbol name="bookmark.fill" size={14} color={t.color.accent.base} />
            <Text style={ds.bookmarkCountText}>
              {bookmarks.length} bookmark{bookmarks.length !== 1 ? "s" : ""}
            </Text>
          </View>
        )}

        {highlights.length > 0 ? (
          highlights.map((hl) => (
            <View key={hl.id} style={ds.highlightCard}>
              <View style={ds.highlightHeader}>
                <View style={[ds.highlightDot, { backgroundColor: hl.color }]} />
              </View>
              <Text style={ds.highlightText}>"{hl.text}"</Text>
              {hl.note && (
                <Text style={ds.highlightNote}>{hl.note}</Text>
              )}
              <Text style={ds.highlightDate}>
                {new Date(hl.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </Text>
            </View>
          ))
        ) : (
          <View style={ds.emptyState}>
            <IconSymbol name="highlighter" size={28} color={t.color.text.muted} />
            <Text style={ds.emptyText}>No highlights yet. Select text in the reader to highlight.</Text>
          </View>
        )}
      </View>
    );
  }

  function renderActiveTab() {
    if (loading) {
      return (
        <View style={ds.loadingContainer}>
          <ActivityIndicator size="small" color={t.color.accent.base} />
        </View>
      );
    }
    switch (activeTab) {
      case "overview": return renderOverview();
      case "progress": return renderProgress();
      case "notes": return renderNotes();
      case "highlights": return renderHighlights();
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={ds.overlay} onPress={onClose}>
        <Pressable style={ds.sheet} onPress={() => {}}>
          <View style={ds.handle} />

          {/* Book Header */}
          <View style={ds.bookHeader}>
            {b.cover_url && (
              <Image source={{ uri: b.cover_url }} style={ds.coverThumb} />
            )}
            <View style={ds.bookInfo}>
              <Text style={ds.bookTitle} numberOfLines={2}>{b.title}</Text>
              <Text style={ds.bookAuthor} numberOfLines={1}>{b.authors || "Unknown Author"}</Text>
              <View style={[ds.statusBadge, { backgroundColor: statusInfo.bg }]}>
                <Text style={[ds.statusText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
              </View>
            </View>
          </View>

          {/* Tab Bar */}
          <TabBar tabs={tabs} active={activeTab} onSelect={(k) => setActiveTab(k as TabKey)} />

          {/* Tab Content */}
          <ScrollView showsVerticalScrollIndicator={false} bounces={false} style={ds.scrollArea}>
            {renderActiveTab()}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ── Styles ──────────────────────────────────────── */

const ds = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(56,73,89,0.52)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: t.color.bg.raised,
    borderTopLeftRadius: t.radius["5xl"],
    borderTopRightRadius: t.radius["5xl"],
    paddingHorizontal: t.space._5,
    paddingBottom: t.space._10,
    maxHeight: "85%",
    borderWidth: 1,
    borderColor: t.color.glass.border,
    ...t.shadow.top,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: "rgba(56,73,89,0.16)",
    alignSelf: "center",
    marginTop: t.space._3,
    marginBottom: t.space._4,
  },
  scrollArea: {
    flexGrow: 1,
  },

  /* ── Book Header ── */
  bookHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: t.space._4,
    gap: t.space._4,
  },
  coverThumb: {
    width: 56,
    height: 84,
    borderRadius: t.radius.md,
    backgroundColor: t.color.bg.overlay,
  },
  bookInfo: {
    flex: 1,
    justifyContent: "center",
  },
  bookTitle: {
    ...t.font.headline,
    marginBottom: t.space._1,
  },
  bookAuthor: {
    ...t.font.caption,
    color: t.color.text.tertiary,
    marginBottom: t.space._2,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: t.space._3,
    paddingVertical: t.space._1,
    borderRadius: t.radius.pill,
  },
  statusText: {
    ...t.font.micro,
    fontWeight: "700",
  },

  /* ── Tab Bar ── */
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: t.color.border.subtle,
    marginBottom: t.space._3,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: t.space._3,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: t.color.accent.base,
  },
  tabText: {
    ...t.font.micro,
    color: t.color.text.tertiary,
  },
  tabTextActive: {
    color: t.color.accent.base,
    fontWeight: "700",
  },

  /* ── Tab Content ── */
  tabContent: {
    paddingBottom: t.space._4,
  },
  loadingContainer: {
    paddingVertical: t.space._10,
    alignItems: "center",
  },

  /* ── Overview — Metadata ── */
  metaSection: {
    marginBottom: t.space._3,
    gap: t.space._2,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: t.space._1,
  },
  metaLabel: {
    ...t.font.caption,
    color: t.color.text.tertiary,
  },
  metaValue: {
    ...t.font.caption,
    color: t.color.text.primary,
    fontWeight: "600",
  },
  genreContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: t.space._2,
    marginBottom: t.space._3,
  },
  genreTag: {
    backgroundColor: t.color.accent.bg,
    paddingHorizontal: t.space._3,
    paddingVertical: t.space._1,
    borderRadius: t.radius.pill,
    borderWidth: 1,
    borderColor: t.color.accent.border,
  },
  genreText: {
    ...t.font.tiny,
    color: t.color.accent.strong,
    fontWeight: "600",
  },
  descSection: {
    marginBottom: t.space._3,
  },
  descText: {
    ...t.font.body,
    color: t.color.text.secondary,
    lineHeight: 20,
  },
  descToggle: {
    ...t.font.micro,
    color: t.color.accent.base,
    marginTop: t.space._1,
  },
  seriesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space._2,
    marginBottom: t.space._4,
    backgroundColor: t.color.accent.bg,
    paddingHorizontal: t.space._3,
    paddingVertical: t.space._2,
    borderRadius: t.radius.lg,
  },
  seriesText: {
    ...t.font.caption,
    color: t.color.accent.strong,
  },

  /* ── Overview — Actions (preserved) ── */
  actions: { marginTop: t.space._2, gap: t.space._2 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: t.space._4 - 2,
    paddingHorizontal: t.space._5,
    borderRadius: t.radius["2xl"],
  },
  actionIcon: { fontSize: 16, marginRight: t.space._3 },
  actionLabel: { fontSize: 15, fontWeight: "600" as const },
  deleteBtn: { backgroundColor: t.color.error.bg, marginTop: t.space._2 },
  deleteIcon: { color: t.color.error.base },
  deleteLabel: { color: t.color.error.base },

  /* ── Progress Tab ── */
  progressSection: {
    marginBottom: t.space._5,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: t.space._2,
  },
  progressPct: {
    ...t.font.title,
    color: t.color.accent.strong,
  },
  progressPages: {
    ...t.font.caption,
    color: t.color.text.tertiary,
  },
  progressBarBg: {
    height: 8,
    borderRadius: t.radius.pill,
    backgroundColor: t.color.accent.bg,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: t.radius.pill,
    backgroundColor: t.color.accent.base,
  },
  sectionTitle: {
    ...t.font.label,
    marginBottom: t.space._3,
    marginTop: t.space._2,
  },
  statsGrid: {
    flexDirection: "row",
    gap: t.space._3,
    marginBottom: t.space._4,
  },
  statCard: {
    flex: 1,
    backgroundColor: t.color.glass.bg,
    borderRadius: t.radius.xl,
    borderWidth: 1,
    borderColor: t.color.glass.border,
    paddingVertical: t.space._3,
    alignItems: "center",
  },
  statValue: {
    ...t.font.headline,
    color: t.color.accent.strong,
  },
  statLabel: {
    ...t.font.tiny,
    color: t.color.text.tertiary,
    marginTop: t.space._1,
  },
  rereadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space._2,
    marginTop: t.space._2,
    paddingVertical: t.space._2,
  },
  rereadText: {
    ...t.font.caption,
    color: t.color.accent.base,
  },

  /* ── Timeline ── */
  timeline: {
    marginBottom: t.space._4,
    paddingLeft: t.space._2,
  },
  timelineItem: {
    flexDirection: "row",
    minHeight: 44,
  },
  timelineDotContainer: {
    width: 20,
    alignItems: "center",
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: t.color.border.default,
    marginTop: 4,
  },
  timelineDotActive: {
    backgroundColor: t.color.accent.base,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: t.color.border.subtle,
    marginTop: 2,
  },
  timelineContent: {
    flex: 1,
    marginLeft: t.space._3,
    paddingBottom: t.space._3,
  },
  timelineLabel: {
    ...t.font.caption,
    color: t.color.text.primary,
    fontWeight: "600",
  },
  timelineDate: {
    ...t.font.tiny,
    color: t.color.text.tertiary,
    marginTop: 2,
  },

  /* ── Notes Tab ── */
  noteCard: {
    backgroundColor: t.color.glass.bg,
    borderRadius: t.radius.xl,
    borderWidth: 1,
    borderColor: t.color.glass.border,
    padding: t.space._4,
    marginBottom: t.space._3,
  },
  noteContent: {
    ...t.font.body,
    color: t.color.text.primary,
    lineHeight: 20,
  },
  noteFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: t.space._2,
  },
  notePage: {
    ...t.font.tiny,
    color: t.color.accent.base,
  },
  noteDate: {
    ...t.font.tiny,
    color: t.color.text.muted,
  },
  addNoteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: t.space._2,
    paddingVertical: t.space._3,
    marginTop: t.space._2,
    borderRadius: t.radius.xl,
    borderWidth: 1,
    borderColor: t.color.accent.border,
    borderStyle: "dashed",
  },
  addNoteBtnText: {
    ...t.font.caption,
    color: t.color.accent.base,
    fontWeight: "600",
  },
  addNoteContainer: {
    marginTop: t.space._3,
    backgroundColor: t.color.glass.bg,
    borderRadius: t.radius.xl,
    borderWidth: 1,
    borderColor: t.color.accent.border,
    padding: t.space._3,
  },
  noteInput: {
    ...t.font.body,
    color: t.color.text.primary,
    minHeight: 80,
    textAlignVertical: "top",
  },
  noteInputActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: t.space._3,
    marginTop: t.space._2,
  },
  noteInputCancel: {
    paddingVertical: t.space._2,
    paddingHorizontal: t.space._4,
  },
  noteInputCancelText: {
    ...t.font.caption,
    color: t.color.text.tertiary,
  },
  noteInputSave: {
    paddingVertical: t.space._2,
    paddingHorizontal: t.space._4,
    backgroundColor: t.color.accent.base,
    borderRadius: t.radius.lg,
  },
  noteInputSaveDisabled: {
    opacity: 0.4,
  },
  noteInputSaveText: {
    ...t.font.caption,
    color: t.color.text.inverse,
    fontWeight: "700",
  },

  /* ── Highlights Tab ── */
  bookmarkCountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space._2,
    marginBottom: t.space._3,
    backgroundColor: t.color.accent.bg,
    paddingHorizontal: t.space._3,
    paddingVertical: t.space._2,
    borderRadius: t.radius.lg,
  },
  bookmarkCountText: {
    ...t.font.caption,
    color: t.color.accent.strong,
  },
  highlightCard: {
    backgroundColor: t.color.glass.bg,
    borderRadius: t.radius.xl,
    borderWidth: 1,
    borderColor: t.color.glass.border,
    padding: t.space._4,
    marginBottom: t.space._3,
  },
  highlightHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: t.space._2,
  },
  highlightDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  highlightText: {
    ...t.font.body,
    color: t.color.text.primary,
    fontStyle: "italic",
    lineHeight: 20,
  },
  highlightNote: {
    ...t.font.caption,
    color: t.color.text.secondary,
    marginTop: t.space._2,
    paddingLeft: t.space._3,
    borderLeftWidth: 2,
    borderLeftColor: t.color.border.accent,
  },
  highlightDate: {
    ...t.font.tiny,
    color: t.color.text.muted,
    marginTop: t.space._2,
  },

  /* ── Empty State ── */
  emptyState: {
    alignItems: "center",
    paddingVertical: t.space._10,
    gap: t.space._3,
  },
  emptyText: {
    ...t.font.caption,
    color: t.color.text.muted,
    textAlign: "center",
    maxWidth: 220,
  },
});
