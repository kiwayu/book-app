import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Switch,
  StyleSheet,
  Linking,
  Alert,
  TextInput,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import * as DocumentPicker from "expo-document-picker";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { t } from "@/theme";
import {
  exportLibraryJSON,
  exportLibraryCSV,
  importFromJSON,
  parseGoodreadsCSV,
  type ImportResult,
} from "@/services/dataExport";
import {
  getAllSettings,
  setSetting,
  resetSettings,
  type AppSettings,
} from "@/services/settings";
import { setGoal, getGoalsForYear, type Goal } from "@/services/goals";
import { getAll, execute } from "@/db/database";

/* ── Display maps ──────────────────────────────────── */

const STATUS_LABELS: Record<string, string> = {
  want_to_read: "Want to Read",
  reading: "Currently Reading",
};

const THEME_LABELS: Record<string, string> = {
  light: "Light",
  sepia: "Sepia",
  dark: "Dark",
  night: "Night",
};

const FONT_OPTIONS = [
  "Georgia",
  "System",
  "Palatino",
  "Bookerly",
  "Lora",
  "Times New Roman",
  "Helvetica",
  "Courier",
];

const ACCENT_COLORS = [
  { label: "Blue", value: "#5a9dd4" },
  { label: "Indigo", value: "#818cf8" },
  { label: "Teal", value: "#14b8a6" },
  { label: "Green", value: "#0ea369" },
  { label: "Amber", value: "#d97706" },
  { label: "Rose", value: "#e11d48" },
  { label: "Purple", value: "#a855f7" },
  { label: "Slate", value: "#64748b" },
];

/* ── Section wrapper ─────────────────────────────────── */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionBody}>{children}</View>
    </View>
  );
}

/* ── Row components ──────────────────────────────────── */

function Row({
  label,
  value,
  onPress,
  last,
  destructive,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  last?: boolean;
  destructive?: boolean;
}) {
  const content = (
    <View style={[s.row, last && s.rowLast]}>
      <Text
        style={[s.rowLabel, destructive && { color: t.color.error.base }]}
      >
        {label}
      </Text>
      <View style={s.rowRight}>
        {value ? <Text style={s.rowValue}>{value}</Text> : null}
        {onPress ? <Text style={s.rowChevron}>&rsaquo;</Text> : null}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => pressed && s.rowPressed}
      >
        {content}
      </Pressable>
    );
  }
  return content;
}

function ToggleRow({
  label,
  value,
  onValueChange,
  last,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <View style={[s.row, last && s.rowLast]}>
      <Text style={s.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{
          false: t.color.border.default,
          true: t.color.accent.light,
        }}
        thumbColor={value ? t.color.accent.base : "#f4f3f4"}
      />
    </View>
  );
}

/* ── Picker modal ────────────────────────────────────── */

function PickerModal<T extends string>({
  visible,
  title,
  options,
  current,
  onSelect,
  onClose,
  renderLabel,
}: {
  visible: boolean;
  title: string;
  options: T[];
  current: T;
  onSelect: (v: T) => void;
  onClose: () => void;
  renderLabel?: (v: T) => string;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={s.modalOverlay} onPress={onClose}>
        <Pressable style={s.modalContent} onPress={() => {}}>
          <Text style={s.modalTitle}>{title}</Text>
          {options.map((opt) => {
            const isSelected = opt === current;
            const label = renderLabel ? renderLabel(opt) : opt;
            return (
              <Pressable
                key={opt}
                style={[s.modalOption, isSelected && s.modalOptionSelected]}
                onPress={() => {
                  onSelect(opt);
                  onClose();
                }}
              >
                <Text
                  style={[
                    s.modalOptionText,
                    isSelected && s.modalOptionTextSelected,
                  ]}
                >
                  {label}
                </Text>
                {isSelected && (
                  <IconSymbol
                    name="checkmark"
                    size={18}
                    color={t.color.accent.base}
                  />
                )}
              </Pressable>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ── Number input modal ──────────────────────────────── */

function NumberInputModal({
  visible,
  title,
  subtitle,
  value,
  onSave,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  value: number;
  onSave: (v: number) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(value > 0 ? String(value) : "");

  useEffect(() => {
    if (visible) setText(value > 0 ? String(value) : "");
  }, [visible, value]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={s.modalOverlay} onPress={onClose}>
        <Pressable style={s.modalContent} onPress={() => {}}>
          <Text style={s.modalTitle}>{title}</Text>
          {subtitle ? (
            <Text style={s.modalSubtitle}>{subtitle}</Text>
          ) : null}
          <TextInput
            style={s.numberInput}
            value={text}
            onChangeText={setText}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={t.color.text.faint}
            autoFocus
          />
          <View style={s.modalButtons}>
            <Pressable style={s.modalBtn} onPress={onClose}>
              <Text style={s.modalBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[s.modalBtn, s.modalBtnPrimary]}
              onPress={() => {
                const num = parseInt(text, 10);
                onSave(isNaN(num) || num < 0 ? 0 : num);
                onClose();
              }}
            >
              <Text style={[s.modalBtnText, s.modalBtnTextPrimary]}>
                Save
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ── Color picker row ────────────────────────────────── */

function ColorPickerRow({
  label,
  colors,
  current,
  onSelect,
  last,
}: {
  label: string;
  colors: { label: string; value: string }[];
  current: string;
  onSelect: (v: string) => void;
  last?: boolean;
}) {
  return (
    <View style={[s.colorRow, last && s.rowLast]}>
      <Text style={s.rowLabel}>{label}</Text>
      <View style={s.colorPalette}>
        {colors.map((c) => (
          <Pressable
            key={c.value}
            onPress={() => onSelect(c.value)}
            style={[
              s.colorDot,
              { backgroundColor: c.value },
              current === c.value && s.colorDotSelected,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

/* ── Main screen ─────────────────────────────────────── */

export default function SettingsTab() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [pickerModal, setPickerModal] = useState<{
    key: keyof AppSettings;
    title: string;
    options: string[];
    renderLabel?: (v: string) => string;
  } | null>(null);

  const [numberModal, setNumberModal] = useState<{
    field: "yearlyBookGoal" | "dailyPageGoal" | "dailyReadingMinutes";
    title: string;
    subtitle?: string;
  } | null>(null);

  const load = useCallback(async () => {
    const [s, g] = await Promise.all([getAllSettings(), getGoalsForYear()]);
    setSettings(s);
    setGoals(g);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = useCallback(
    async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      if (!settings) return;
      setSettings({ ...settings, [key]: value });
      await setSetting(key, value);
    },
    [settings]
  );

  const updateGoal = useCallback(
    async (
      field: "yearlyBookGoal" | "dailyPageGoal" | "dailyReadingMinutes",
      value: number
    ) => {
      if (!settings) return;
      setSettings({ ...settings, [field]: value });
      await setSetting(field, value);

      // Also persist to goals table
      const typeMap = {
        yearlyBookGoal: "yearly_books",
        dailyPageGoal: "daily_pages",
        dailyReadingMinutes: "daily_minutes",
      } as const;
      await setGoal(typeMap[field], value);
      const g = await getGoalsForYear();
      setGoals(g);
    },
    [settings]
  );

  const handleExportJSON = useCallback(async () => {
    try {
      const json = await exportLibraryJSON();
      const path = (FileSystem.cacheDirectory ?? "") + "bookbrain_export.json";
      await FileSystem.writeAsStringAsync(path, json);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(path, { mimeType: "application/json", dialogTitle: "Export Library" });
      } else {
        Alert.alert("Export Ready", "File saved to cache. Sharing not available on this device.");
      }
    } catch (e) {
      Alert.alert("Export Failed", "Could not export library data.");
    }
  }, []);

  const handleExportCSV = useCallback(async () => {
    try {
      const csv = await exportLibraryCSV();
      const path = (FileSystem.cacheDirectory ?? "") + "bookbrain_export.csv";
      await FileSystem.writeAsStringAsync(path, csv);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(path, { mimeType: "text/csv", dialogTitle: "Export Library" });
      } else {
        Alert.alert("Export Ready", "File saved to cache. Sharing not available on this device.");
      }
    } catch (e) {
      Alert.alert("Export Failed", "Could not export library data.");
    }
  }, []);

  const handleImport = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/csv", "text/comma-separated-values"],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];
      const content = await FileSystem.readAsStringAsync(file.uri);

      let importResult: ImportResult;

      if (file.name?.toLowerCase().endsWith(".csv")) {
        importResult = await parseGoodreadsCSV(content);
      } else {
        importResult = await importFromJSON(content);
      }

      const message = [
        `Books imported: ${importResult.booksImported}`,
        `Books skipped: ${importResult.booksSkipped}`,
        importResult.errors.length > 0
          ? `Errors: ${importResult.errors.length}`
          : null,
      ].filter(Boolean).join("\n");

      Alert.alert("Import Complete", message);
      await load();
    } catch (e) {
      Alert.alert("Import Failed", "Could not read the selected file.");
    }
  }, [load]);

  const handleClearData = useCallback(() => {
    Alert.alert(
      "Clear All Data",
      "This will permanently delete all your books, reading progress, and settings. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Everything",
          style: "destructive",
          onPress: async () => {
            try {
              await execute("DELETE FROM book_tags");
              await execute("DELETE FROM folder_books");
              await execute("DELETE FROM book_notes");
              await execute("DELETE FROM highlights");
              await execute("DELETE FROM bookmarks");
              await execute("DELETE FROM reading_sessions");
              await execute("DELETE FROM reading_progress");
              await execute("DELETE FROM library_entries");
              await execute("DELETE FROM books");
              await execute("DELETE FROM tags");
              await execute("DELETE FROM folders");
              await execute("DELETE FROM goals");
              await resetSettings();
              await load();
              Alert.alert("Done", "All data has been cleared.");
            } catch {
              Alert.alert("Error", "Could not clear data.");
            }
          },
        },
      ]
    );
  }, [load]);

  const handleResetSettings = useCallback(() => {
    Alert.alert(
      "Reset Settings",
      "This will reset all settings to their defaults. Your library data will not be affected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            await resetSettings();
            await load();
          },
        },
      ]
    );
  }, [load]);

  if (loading || !settings) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.loadingContainer}>
          <Text style={s.loadingText}>Loading settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const yearlyGoal = goals.find((g) => g.type === "yearly_books");
  const dailyPageGoal = goals.find((g) => g.type === "daily_pages");
  const dailyMinGoal = goals.find((g) => g.type === "daily_minutes");

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.title}>Settings</Text>
        <Text style={s.subtitle}>Preferences and app configuration</Text>

        {/* ── Library ──────────────────────────────── */}

        <Section title="Library">
          <Row
            label="Default status when adding"
            value={STATUS_LABELS[settings.defaultAddStatus]}
            onPress={() =>
              setPickerModal({
                key: "defaultAddStatus",
                title: "Default Add Status",
                options: ["want_to_read", "reading"],
                renderLabel: (v) => STATUS_LABELS[v] ?? v,
              })
            }
          />
          <ToggleRow
            label="Show covers in list view"
            value={settings.showCoversInList}
            onValueChange={(v) => update("showCoversInList", v)}
          />
          <ToggleRow
            label="Confirm before deleting"
            value={settings.confirmBeforeDelete}
            onValueChange={(v) => update("confirmBeforeDelete", v)}
            last
          />
        </Section>

        {/* ── Reader ───────────────────────────────── */}

        <Section title="Reader">
          <Row
            label="Default font"
            value={settings.readerFont}
            onPress={() =>
              setPickerModal({
                key: "readerFont",
                title: "Default Font",
                options: FONT_OPTIONS,
              })
            }
          />
          <Row
            label="Default font size"
            value={`${settings.readerFontSize}px`}
            onPress={() =>
              setPickerModal({
                key: "readerFontSize" as keyof AppSettings,
                title: "Font Size",
                options: [
                  "13",
                  "14",
                  "15",
                  "16",
                  "17",
                  "18",
                  "19",
                  "20",
                  "22",
                  "24",
                  "26",
                ],
                renderLabel: (v) => `${v}px`,
              })
            }
          />
          <Row
            label="Default theme"
            value={THEME_LABELS[settings.readerTheme]}
            onPress={() =>
              setPickerModal({
                key: "readerTheme",
                title: "Reader Theme",
                options: ["light", "sepia", "dark", "night"],
                renderLabel: (v) => THEME_LABELS[v] ?? v,
              })
            }
          />
          <Row
            label="Line height"
            value={String(settings.readerLineHeight)}
            onPress={() =>
              setPickerModal({
                key: "readerLineHeight" as keyof AppSettings,
                title: "Line Height",
                options: [
                  "1.3",
                  "1.4",
                  "1.5",
                  "1.6",
                  "1.7",
                  "1.8",
                  "1.9",
                  "2.0",
                ],
              })
            }
          />
          <Row
            label="Margin"
            value={`${settings.readerMargin}px`}
            onPress={() =>
              setPickerModal({
                key: "readerMargin" as keyof AppSettings,
                title: "Margin",
                options: ["8", "12", "16", "20", "24", "28", "32", "40", "48"],
                renderLabel: (v) => `${v}px`,
              })
            }
            last
          />
        </Section>

        {/* ── Reading Goals ────────────────────────── */}

        <Section title="Reading Goals">
          <Row
            label="Yearly book goal"
            value={
              yearlyGoal
                ? `${yearlyGoal.target} books`
                : "Not set"
            }
            onPress={() =>
              setNumberModal({
                field: "yearlyBookGoal",
                title: "Yearly Book Goal",
                subtitle: `How many books do you want to finish in ${new Date().getFullYear()}?`,
              })
            }
          />
          <Row
            label="Daily page goal"
            value={
              dailyPageGoal
                ? `${dailyPageGoal.target} pages`
                : "Not set"
            }
            onPress={() =>
              setNumberModal({
                field: "dailyPageGoal",
                title: "Daily Page Goal",
                subtitle: "How many pages do you want to read each day?",
              })
            }
          />
          <Row
            label="Daily reading time"
            value={
              dailyMinGoal
                ? `${dailyMinGoal.target} min`
                : "Not set"
            }
            onPress={() =>
              setNumberModal({
                field: "dailyReadingMinutes",
                title: "Daily Reading Time",
                subtitle: "How many minutes do you want to read each day?",
              })
            }
            last
          />
        </Section>

        {/* ── Appearance ───────────────────────────── */}

        <Section title="Appearance">
          <ColorPickerRow
            label="Accent color"
            colors={ACCENT_COLORS}
            current={settings.accentColor}
            onSelect={(v) => update("accentColor", v)}
          />
          <ToggleRow
            label="Compact mode"
            value={settings.compactMode}
            onValueChange={(v) => update("compactMode", v)}
            last
          />
        </Section>

        {/* ── Data ─────────────────────────────────── */}

        <Section title="Data">
          <Row label="Export library (JSON)" onPress={handleExportJSON} />
          <Row label="Export library (CSV)" onPress={handleExportCSV} />
          <Row
            label="Import library"
            value="JSON or Goodreads CSV"
            onPress={handleImport}
          />
          <Row label="Reset settings" onPress={handleResetSettings} />
          <Row label="Clear all data" onPress={handleClearData} destructive last />
        </Section>

        {/* ── About ────────────────────────────────── */}

        <Section title="About">
          <Row label="App version" value="1.0.0" />
          <Row
            label="Report an issue"
            onPress={() => Linking.openURL("https://github.com")}
          />
          <Row
            label="Privacy policy"
            onPress={() => {}}
          />
          <Row
            label="Licenses"
            onPress={() => {}}
            last
          />
        </Section>

        <Text style={s.footer}>
          BookBrain {"\u00b7"} Built with Expo & React Native
        </Text>
      </ScrollView>

      {/* ── Picker Modal ────────────────────────── */}

      {pickerModal && (
        <PickerModal
          visible
          title={pickerModal.title}
          options={pickerModal.options as string[]}
          current={String(
            settings[pickerModal.key as keyof AppSettings]
          )}
          onSelect={(v) => {
            const key = pickerModal.key;
            // Handle numeric settings stored as picker strings
            if (
              key === "readerFontSize" ||
              key === "readerMargin"
            ) {
              update(key as "readerFontSize", parseInt(v, 10) as never);
            } else if (key === "readerLineHeight") {
              update(key as "readerLineHeight", parseFloat(v) as never);
            } else {
              update(key as keyof AppSettings, v as never);
            }
          }}
          onClose={() => setPickerModal(null)}
          renderLabel={pickerModal.renderLabel}
        />
      )}

      {/* ── Number Modal ────────────────────────── */}

      {numberModal && (
        <NumberInputModal
          visible
          title={numberModal.title}
          subtitle={numberModal.subtitle}
          value={settings[numberModal.field] as number}
          onSave={(v) => updateGoal(numberModal.field, v)}
          onClose={() => setNumberModal(null)}
        />
      )}
    </SafeAreaView>
  );
}

/* ── Styles ──────────────────────────────────────────── */

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: t.color.bg.base,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: t.space._5,
    paddingTop: t.space._4,
    paddingBottom: t.space._10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    ...t.font.body,
    color: t.color.text.tertiary,
  },
  title: {
    ...t.font.display,
    marginBottom: 2,
  },
  subtitle: {
    ...t.font.body,
    color: t.color.text.tertiary,
    marginBottom: t.space._6,
  },

  /* ── Section ─── */
  section: {
    marginBottom: t.space._5,
  },
  sectionTitle: {
    ...t.font.label,
    paddingHorizontal: t.space._2,
    marginBottom: t.space._2,
  },
  sectionBody: {
    backgroundColor: t.color.bg.raised,
    borderRadius: t.radius["3xl"],
    borderWidth: 1,
    borderColor: t.color.border.subtle,
    overflow: "hidden",
    ...t.shadow.soft,
  },

  /* ── Row ─── */
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: t.space._4,
    paddingVertical: t.space._4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.color.border.subtle,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowPressed: {
    backgroundColor: t.color.bg.overlay,
  },
  rowLabel: {
    ...t.font.body,
    flex: 1,
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space._2,
  },
  rowValue: {
    ...t.font.body,
    color: t.color.text.tertiary,
  },
  rowChevron: {
    color: t.color.text.faint,
    fontSize: 20,
    fontWeight: "300",
  },

  /* ── Color picker ─── */
  colorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: t.space._4,
    paddingVertical: t.space._3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.color.border.subtle,
  },
  colorPalette: {
    flexDirection: "row",
    gap: t.space._2,
  },
  colorDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorDotSelected: {
    borderColor: t.color.text.primary,
    borderWidth: 2.5,
  },

  /* ── Modal ─── */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(56,73,89,0.52)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: t.space._8,
  },
  modalContent: {
    backgroundColor: t.color.bg.raised,
    borderRadius: t.radius["4xl"],
    width: "100%",
    maxWidth: 360,
    paddingVertical: t.space._5,
    paddingHorizontal: t.space._5,
    ...t.shadow.heavy,
  },
  modalTitle: {
    ...t.font.title,
    marginBottom: t.space._4,
  },
  modalSubtitle: {
    ...t.font.body,
    color: t.color.text.tertiary,
    marginBottom: t.space._4,
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: t.space._3,
    paddingHorizontal: t.space._3,
    borderRadius: t.radius.lg,
    marginBottom: t.space._1,
  },
  modalOptionSelected: {
    backgroundColor: t.color.accent.bg,
  },
  modalOptionText: {
    ...t.font.body,
  },
  modalOptionTextSelected: {
    color: t.color.accent.strong,
    fontWeight: "700",
  },

  /* ── Number input ─── */
  numberInput: {
    ...t.font.title,
    textAlign: "center",
    backgroundColor: t.color.bg.base,
    borderRadius: t.radius.xl,
    borderWidth: 1,
    borderColor: t.color.border.default,
    paddingVertical: t.space._3,
    paddingHorizontal: t.space._4,
    marginBottom: t.space._4,
  },
  modalButtons: {
    flexDirection: "row",
    gap: t.space._3,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: t.space._3,
    borderRadius: t.radius.xl,
    alignItems: "center",
    backgroundColor: t.color.bg.base,
    borderWidth: 1,
    borderColor: t.color.border.default,
  },
  modalBtnPrimary: {
    backgroundColor: t.color.accent.base,
    borderColor: t.color.accent.base,
  },
  modalBtnText: {
    ...t.font.body,
    fontWeight: "600",
  },
  modalBtnTextPrimary: {
    color: t.color.text.inverse,
  },

  /* ── Footer ─── */
  footer: {
    ...t.font.micro,
    textAlign: "center",
    marginTop: t.space._4,
    color: t.color.text.faint,
  },
});
