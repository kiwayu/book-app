import { useState, useEffect, useCallback, type ReactNode } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { CartesianChart, Bar } from "victory-native";
import { PolarChart, Pie } from "victory-native";
import {
  booksPerYear,
  pagesPerYear,
  averagePagesPerBook,
  readingStreak,
  dnfRatio,
  type LabeledValue,
  type StreakResult,
} from "@/services/analytics";

/* ── reusable card wrapper ───────────────────────── */

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="bg-neutral-900 rounded-2xl p-4 mb-4">
      <Text className="text-neutral-400 text-xs font-medium uppercase tracking-wider mb-3">
        {title}
      </Text>
      {children}
    </View>
  );
}

/* ── stat card for single numbers ────────────────── */

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
      <Text className="text-white text-4xl font-bold">{value}</Text>
      {subtitle ? (
        <Text className="text-neutral-500 text-sm mt-1">{subtitle}</Text>
      ) : null}
    </Card>
  );
}

/* ── bar chart card ──────────────────────────────── */

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
        <Text className="text-neutral-500 text-sm py-6 text-center">
          No data yet
        </Text>
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

      <View className="flex-row flex-wrap mt-3 gap-x-4 gap-y-1">
        {data.map((d) => (
          <Text key={d.label} className="text-neutral-400 text-xs">
            {d.label}:{" "}
            <Text className="text-white font-semibold">
              {d.value.toLocaleString()}
            </Text>
          </Text>
        ))}
      </View>
    </Card>
  );
}

/* ── pie chart for DNF ratio ─────────────────────── */

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
        <Text className="text-neutral-500 text-sm py-6 text-center">
          No data yet
        </Text>
      </Card>
    );
  }

  const pieData = [
    { name: "Finished", value: finished, color: "#6366f1" },
    { name: "DNF", value: dnf, color: "#ef4444" },
  ];

  return (
    <Card title="Completion Rate">
      <View className="items-center" style={{ height: 180 }}>
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

      <View className="flex-row justify-center mt-3 gap-x-6">
        <View className="flex-row items-center">
          <View className="w-3 h-3 rounded-full bg-indigo-500 mr-1.5" />
          <Text className="text-neutral-300 text-sm">
            Finished ({finished})
          </Text>
        </View>
        <View className="flex-row items-center">
          <View className="w-3 h-3 rounded-full bg-red-500 mr-1.5" />
          <Text className="text-neutral-300 text-sm">DNF ({dnf})</Text>
        </View>
      </View>

      <Text className="text-neutral-500 text-xs text-center mt-2">
        {ratio}% did not finish
      </Text>
    </Card>
  );
}

/* ── main screen ─────────────────────────────────── */

interface AnalyticsData {
  booksYear: LabeledValue[];
  pagesYear: LabeledValue[];
  avgPages: number;
  streak: StreakResult;
  dnf: { dnf: number; finished: number; ratio: number };
}

export default function AnalyticsScreen() {
  const [data, setData] = useState<AnalyticsData | null>(null);
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

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (!data) {
    return (
      <View className="flex-1 bg-neutral-950 items-center justify-center">
        <ActivityIndicator color="#6366f1" />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-neutral-950"
      contentContainerClassName="px-4 pt-4 pb-8"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#6366f1"
        />
      }
    >
      <Text className="text-white text-2xl font-bold mb-1">Analytics</Text>
      <Text className="text-neutral-500 text-sm mb-5">
        Your reading at a glance
      </Text>

      {/* Stat row */}
      <StatCard
        title="Avg Pages / Book"
        value={data.avgPages.toLocaleString()}
        subtitle="across finished books"
      />

      {/* Streak cards */}
      <View className="flex-row gap-4 mb-0">
        <View className="flex-1">
          <StatCard
            title="Current Streak"
            value={`${data.streak.current}d`}
            subtitle="consecutive days"
          />
        </View>
        <View className="flex-1">
          <StatCard
            title="Longest Streak"
            value={`${data.streak.longest}d`}
            subtitle="personal best"
          />
        </View>
      </View>

      {/* Charts */}
      <BarChartCard
        title="Books Per Year"
        data={data.booksYear}
        color="#6366f1"
      />

      <BarChartCard
        title="Pages Per Year"
        data={data.pagesYear}
        color="#8b5cf6"
      />

      <DnfPieCard
        dnf={data.dnf.dnf}
        finished={data.dnf.finished}
        ratio={data.dnf.ratio}
      />
    </ScrollView>
  );
}
