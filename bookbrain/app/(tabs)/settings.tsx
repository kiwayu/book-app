import { View, Text, Pressable, ScrollView, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '@/theme';

/* ── Section wrapper ─────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionBody}>{children}</View>
    </View>
  );
}

/* ── Row ─────────────────────────────────────────────── */

function Row({
  label,
  value,
  onPress,
  last,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  last?: boolean;
}) {
  const content = (
    <View style={[s.row, last && s.rowLast]}>
      <Text style={s.rowLabel}>{label}</Text>
      <View style={s.rowRight}>
        {value ? <Text style={s.rowValue}>{value}</Text> : null}
        {onPress ? <Text style={s.rowChevron}>›</Text> : null}
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

/* ── Main screen ─────────────────────────────────────── */

export default function SettingsTab() {
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.title}>Settings</Text>
        <Text style={s.subtitle}>Preferences and app configuration</Text>

        <Section title="Library">
          <Row label="Default status when adding" value="Want to Read" />
          <Row label="Show covers in list view" value="On" last />
        </Section>

        <Section title="Reader">
          <Row label="Default font" value="Georgia" />
          <Row label="Default font size" value="17px" />
          <Row label="Default theme" value="Light" last />
        </Section>

        <Section title="About">
          <Row label="App version" value="1.0.0" />
          <Row
            label="Report an issue"
            onPress={() => Linking.openURL('https://github.com')}
          />
          <Row
            label="Privacy policy"
            onPress={() => {}}
            last
          />
        </Section>

        <Text style={s.footer}>
          BookBrain · Built with Expo &amp; React Native
        </Text>
      </ScrollView>
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
  title: {
    ...t.font.display,
    marginBottom: 2,
  },
  subtitle: {
    ...t.font.body,
    color: t.color.text.tertiary,
    marginBottom: t.space._6,
  },
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
    overflow: 'hidden',
    ...t.shadow.soft,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space._2,
  },
  rowValue: {
    ...t.font.body,
    color: t.color.text.tertiary,
  },
  rowChevron: {
    color: t.color.text.faint,
    fontSize: 20,
    fontWeight: '300',
  },
  footer: {
    ...t.font.micro,
    textAlign: 'center',
    marginTop: t.space._4,
    color: t.color.text.faint,
  },
});
