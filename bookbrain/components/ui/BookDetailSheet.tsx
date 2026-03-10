import { View, Text, Pressable, Modal, ScrollView, StyleSheet, Alert } from "react-native";
import { t } from "@/theme";
import { BookCard, type BookCardProgress } from "./BookCard";
import type { BookWithEntry } from "@/store/libraryStore";

interface ActionDef {
  icon: string;
  label: string;
  color: string;
  bg: string;
  onPress: () => void;
}

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

export function BookDetailSheet({
  book, progress, visible, onClose,
  onStartReading, onMarkFinished, onMarkDNF, onOpenReader, onDeleteBook,
}: BookDetailSheetProps) {
  if (!book) return null;

  const status = book.entry.status;
  const actions: ActionDef[] = [];

  if (status === "want_to_read" && onStartReading) {
    actions.push({ icon: "▶", label: "Start Reading", color: t.color.accent.lighter, bg: t.color.accent.bg, onPress: () => onStartReading(book.id) });
  }
  if (status === "reading" && onMarkFinished) {
    actions.push({ icon: "✓", label: "Mark Finished", color: t.color.success.lighter, bg: t.color.success.bg, onPress: () => onMarkFinished(book.id) });
  }
  if ((status === "dnf" || status === "finished") && onStartReading) {
    actions.push({ icon: "▶", label: status === "dnf" ? "Resume Reading" : "Reread", color: t.color.accent.lighter, bg: t.color.accent.bg, onPress: () => onStartReading(book.id) });
  }
  if (onOpenReader) {
    actions.push({ icon: "📖", label: "Open in Reader", color: t.color.text.secondary, bg: t.color.glass.bgHover, onPress: () => onOpenReader(book.id) });
  }
  if (status === "reading" && onMarkDNF) {
    actions.push({ icon: "✕", label: "Did Not Finish", color: t.color.error.light, bg: t.color.error.bg, onPress: () => onMarkDNF(book.id) });
  }

  const handleDelete = onDeleteBook
    ? () => {
        Alert.alert(
          "Remove from Library",
          `Remove "${book.title}" from your library? This cannot be undone.`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Remove",
              style: "destructive",
              onPress: () => { onDeleteBook(book.id); onClose(); },
            },
          ]
        );
      }
    : undefined;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={ds.overlay} onPress={onClose}>
        <Pressable style={ds.sheet} onPress={() => {}}>
          <View style={ds.handle} />

          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            <BookCard book={book} progress={progress} hideActions />

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
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

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
    maxHeight: "75%",
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
});
