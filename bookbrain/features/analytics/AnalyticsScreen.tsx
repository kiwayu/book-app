import { useState, useEffect, useCallback, type ReactNode } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { CartesianChart, Bar } from "victory-native";
import { PolarChart, Pie } from "victory-native";
import { t } from "@/theme";
import {
  booksPerYear,
  pagesPerYear,
  averagePagesPerBook,
  readingStreak,
  dnfRatio,
  type LabeledValue,
  type StreakResult,
} from "@/services/analytics";

/* ── Card wrapper ────────────────────────────────────── */

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={s.card}>
      <Text style={s.cardLabel}>{title}</Text>
      {children}
    </View>
  );
}

/* ── Stat card ───────────────────────────────────────── */

function StatCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
}) {
  return (
    <Card title={title}>
      <Text style={s.statValue}>{value}</Text>
      {subtitle ? <Text style={s.statSub}>{subtitle}</Text> : null}
    </Card>
  );
}

/* ── Bar chart card ──────────────────────────────────── */

function BarChartCard({
  title,
  data,
  color,
}: {
  title: string;
  data: LabeledValue[];
  color: string;
}) {
  const { width } = useWindowDimensions();
  const chartWidth = width - 64;

  if (data.length === 0) {
    return (
      <Card title={title}>
        <Text style={s.emptyText}>No data yet</Text>
      </Card>
    );
  }

  const indexed = data.map((d, i) => ({ ...d, index: i }));

  return (
    <Card title={title}>
      <View style={{ height: 200, width: chartWidth }}>
        <CartesianChart
          data={indexed}
          xKey="index"
          yKeys={["value"]}
          domainPadding={{ left: 24, right: 24, top: 10 }}
        >
          {({ points, chartBounds }) => (
            <Bar
              points={points.value}
              chartBounds={chartBounds}
              color={color}
              roundedCorners={{ topLeft: 5, topRight: 5 }}
              animate={{ type: "spring" }}
            />
          )}
        </CartesianChart>
      </View>

      <View style={s.legendRow}>
        {data.map((d) => (
          <Text key={d.label} style={s.legendItem}>
            {d.label}:{" "}
            <Text style={s.legendValue}>{d.value.toLocaleString()}</Text>
          </Text>
        ))}
      </View>
    </Card>
  );
}

/* ── Pie chart — completion rate ─────────────────────── */

function DnfPieCard({
  dnf,
  finished,
  ratio,
}: {
  dnf: number;
  finished: number;
  ratio: number;
}) {
  const total = dnf + finished;

  if (total === 0) {
    return (
      <Card title="Completion Rate">
        <Text style={s.emptyText}>No data yet</Text>
      </Card>
    );
  }

  const pieData = [
    { name: "Finished", value: finished, color: t.color.accent.base },
    { name: "DNF",      value: dnf,      color: "#ef4444" },
  ];

  return (
    <Card title="Completion Rate">
      <View style={s.pieWrap}>
        <PolarChart
          data={pieData}
          labelKey="name"
          valueKey="value"
          colorKey="color"
        >
          <Pie.Chart innerRadius="40%">
            {() => <Pie.Slice />}
          </Pie.Chart>
        </PolarChart>
      </View>

      <View style={s.pieLegend}>
        <View style={s.pieLegendItem}>
          <View style={[s.pieDot, { backgroundColor: t.color.accent.base }]} />
          <Text style={s.pieLegendText}>Finished ({finished})</Text>
        </View>
        <View style={s.pieLegendItem}>
          <View style={[s.pieDot, { backgroundColor: "#ef4444" }]} />
          <Text style={s.pieLegendText}>DNF ({dnf})</Text>
        </View>
      </View>

      <Text style={s.pieRatio}>{ratio}% did not finish</Text>
    </Card>
  );
}

/* ── Main screen ─────────────────────────────────────── */

interface AnalyticsData {
  booksYear: LabeledValue[];
  pagesYear: LabeledValue[];
  avgPages:  number;
  streak:    StreakResult;
  dnf:       { dnf: number; finished: number; ratio: number };
}

export default function AnalyticsScreen() {
  const [data,       setData]       = useState<AnalyticsData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [booksYear, pagesYear, avgPages, streak, dnfData] =
      await Promise.all([
        booksPerYear(),
        pagesPerYear(),
        averagePagesPerBook(),
        readingStreak(),
        dnfRatio(),
      ]);
    setData({ booksYear, pagesYear, avgPages, streak, dnf: dnfData });
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (!data) {
    return (
      <View style={s.loadingWrap}>
        <ActivityIndicator color={t.color.accent.base} />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={t.color.accent.base}
        />
      }
    >
      <Text style={s.title}>Analytics</Text>
      <Text style={s.subtitle}>Your reading at a glance</Text>

      <StatCard
        title="Avg Pages / Book"
        value={data.avgPages.toLocaleString()}
        subtitle="across finished books"
      />

      <View style={s.streakRow}>
        <View style={s.streakCell}>
          <StatCard
            title="Current Streak"
            value={`${data.streak.current}d`}
            subtitle="consecutive days"
          />
        </View>
        <View style={s.streakCell}>
          <StatCard
            title="Longest Streak"
            value={`${data.streak.longest}d`}
            subtitle="personal best"
          />
        </View>
      </View>

      <BarChartCard
        title="Books Per Year"
        data={data.booksYear}
        color={t.color.accent.base}
      />

      <BarChartCard
        title="Pages Per Year"
        data={data.pagesYear}
        color={t.color.accent.strong}
      />

      <DnfPieCard
        dnf={data.dnf.dnf}
        finished={data.dnf.finished}
        ratio={data.dnf.ratio}
      />
    </ScrollView>
  );
}

/* ── Styles ──────────────────────────────────────────── */

const s = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    backgroundColor: t.color.bg.base,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    flex: 1,
    backgroundColor: t.color.bg.base,
  },
  scrollContent: {
    paddingHorizontal: t.space._4,
    paddingTop: t.space._4,
    paddingBottom: t.space._8,
  },
  title: {
    ...t.font.display,
    marginBottom: 2,
  },
  subtitle: {
    ...t.font.body,
    color: t.color.text.tertiary,
    marginBottom: t.space._5,
  },
  card: {
    backgroundColor: t.color.bg.raised,
    borderRadius: t.radius["3xl"],
    padding: t.space._4,
    marginBottom: t.space._4,
    borderWidth: 1,
    borderColor: t.color.border.subtle,
    ...t.shadow.soft,
  },
  cardLabel: {
    ...t.font.label,
    marginBottom: t.space._3,
  },
  statValue: {
    fontSize: 36,
    fontWeight: "800",
    color: t.color.text.primary,
  },
  statSub: {
    ...t.font.caption,
    marginTop: t.space._1,
  },
  emptyText: {
    ...t.font.body,
    color: t.color.text.tertiary,
    textAlign: "center",
    paddingVertical: t.space._6,
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: t.space._3,
    gap: 16,
  },
  legendItem: {
    ...t.font.caption,
  },
  legendValue: {
    ...t.font.caption,
    color: t.color.text.primary,
    fontWeight: "700",
  },
  streakRow: {
    flexDirection: "row",
    gap: t.space._4,
  },
  streakCell: {
    flex: 1,
  },
  pieWrap: {
    height: 180,
    alignItems: "center",
  },
  pieLegend: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: t.space._3,
    gap: 24,
  },
  pieLegendItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  pieDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
  },
  pieLegendText: {
    ...t.font.body,
    color: t.color.text.secondary,
  },
  pieRatio: {
    ...t.font.caption,
    color: t.color.text.tertiary,
    textAlign: "center",
    marginTop: t.space._2,
  },
});
