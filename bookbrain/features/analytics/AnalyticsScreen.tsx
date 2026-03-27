import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CartesianChart, Bar } from "victory-native";
import { PolarChart, Pie } from "victory-native";
import Svg, { Circle } from "react-native-svg";
import { t } from "@/theme";
import { IconSymbol } from "@/components/ui/icon-symbol";
import {
  booksPerYear,
  pagesPerYear,
  averagePagesPerBook,
  readingStreak,
  dnfRatio,
  totalStats,
  booksPerGenre,
  averageReadingSpeed,
  averageDaysToFinish,
  readingHeatmap,
  completionRate,
  authorLeaderboard,
  bookLengthDistribution,
  type LabeledValue,
  type StreakResult,
  type TotalStats,
  type GenreStat,
  type HeatmapDay,
  type AuthorStat,
  type LengthBucket,
} from "@/services/analytics";
import {
  getYearlyBookProgress,
  getDailyProgress,
  type GoalProgress,
  type DailyProgress,
} from "@/services/goals";

/* ══════════════════════════════════════════════════════
   Sub-components — all defined inline
   ══════════════════════════════════════════════════════ */

/* ── Collapsible section ──────────────────────────── */

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View style={s.section}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={s.sectionHeader}
      >
        <Text style={s.sectionTitle}>{title}</Text>
        <IconSymbol
          name={open ? "chevron.up" : "chevron.down"}
          size={16}
          color={t.color.text.tertiary}
        />
      </Pressable>
      {open && <View style={s.sectionBody}>{children}</View>}
    </View>
  );
}

/* ── Card wrapper ─────────────────────────────────── */

function Card({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <View style={s.card}>
      {title ? <Text style={s.cardLabel}>{title}</Text> : null}
      {children}
    </View>
  );
}

/* ── Stat card (for the 2x2 grid) ─────────────────── */

function StatCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: string;
}) {
  return (
    <View style={s.statCard}>
      {icon ? (
        <Text style={s.statIcon}>{icon}</Text>
      ) : null}
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statTitle}>{title}</Text>
      {subtitle ? <Text style={s.statSub}>{subtitle}</Text> : null}
    </View>
  );
}

/* ── Time range pill selector ─────────────────────── */

type TimeRange = "year" | "all";

function TimeRangeSelector({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (v: TimeRange) => void;
}) {
  return (
    <View style={s.pillRow}>
      {(["year", "all"] as const).map((range) => {
        const active = value === range;
        const label = range === "year" ? "This Year" : "All Time";
        return (
          <Pressable
            key={range}
            onPress={() => onChange(range)}
            style={[s.pill, active && s.pillActive]}
          >
            <Text style={[s.pillText, active && s.pillTextActive]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ── Bar chart card ───────────────────────────────── */

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
  const chartWidth = width - 80;

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

/* ── Donut / pie chart — completion rate ──────────── */

function CompletionPieCard({
  finished,
  dnf,
  rate,
}: {
  finished: number;
  dnf: number;
  rate: number;
}) {
  const total = finished + dnf;

  if (total === 0) {
    return (
      <Card title="Completion Rate">
        <Text style={s.emptyText}>No data yet</Text>
      </Card>
    );
  }

  const pieData = [
    { name: "Finished", value: finished, color: t.color.accent.base },
    { name: "DNF", value: dnf, color: t.color.error.base },
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
          <View
            style={[s.pieDot, { backgroundColor: t.color.accent.base }]}
          />
          <Text style={s.pieLegendText}>Finished ({finished})</Text>
        </View>
        <View style={s.pieLegendItem}>
          <View
            style={[s.pieDot, { backgroundColor: t.color.error.base }]}
          />
          <Text style={s.pieLegendText}>DNF ({dnf})</Text>
        </View>
      </View>
      <Text style={s.pieRatio}>{rate}% completion rate</Text>
    </Card>
  );
}

/* ── Genre distribution (horizontal bars) ─────────── */

function GenreDistribution({ data }: { data: GenreStat[] }) {
  if (data.length === 0) {
    return (
      <Card title="Genre Distribution">
        <Text style={s.emptyText}>No data yet</Text>
      </Card>
    );
  }

  const max = Math.max(...data.map((g) => g.count), 1);

  return (
    <Card title="Genre Distribution">
      {data.slice(0, 8).map((genre) => (
        <View key={genre.genre} style={s.hBarRow}>
          <Text style={s.hBarLabel} numberOfLines={1}>
            {genre.genre}
          </Text>
          <View style={s.hBarTrack}>
            <View
              style={[
                s.hBarFill,
                {
                  width: `${Math.max((genre.count / max) * 100, 4)}%`,
                  backgroundColor: t.color.accent.base,
                },
              ]}
            />
          </View>
          <Text style={s.hBarCount}>{genre.count}</Text>
        </View>
      ))}
    </Card>
  );
}

/* ── Reading heatmap (GitHub-style) ───────────────── */

const HEATMAP_CELL = 12;
const HEATMAP_GAP = 2;

const HEATMAP_COLORS = [
  t.color.bg.raised,        // 0 — no activity
  t.color.accent.lightest,  // 1
  t.color.accent.lighter,   // 2
  t.color.accent.light,     // 3
  t.color.accent.base,      // 4
  t.color.accent.strong,    // 5 — max
];

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];

function ReadingHeatmap({ data, year }: { data: HeatmapDay[]; year: number }) {
  const grid = useMemo(() => {
    /* build lookup */
    const lookup = new Map<string, number>();
    let maxMinutes = 0;
    for (const d of data) {
      lookup.set(d.date, d.minutes);
      if (d.minutes > maxMinutes) maxMinutes = d.minutes;
    }

    /* first day of year */
    const jan1 = new Date(year, 0, 1);
    const jan1Day = (jan1.getDay() + 6) % 7; // Mon=0

    /* build week columns */
    const weeks: { date: string; level: number }[][] = [];
    let currentWeek: { date: string; level: number }[] = [];

    /* pad the first week */
    for (let i = 0; i < jan1Day; i++) {
      currentWeek.push({ date: "", level: -1 });
    }

    const daysInYear =
      (new Date(year + 1, 0, 1).getTime() - jan1.getTime()) /
      (1000 * 60 * 60 * 24);

    for (let d = 0; d < daysInYear; d++) {
      const date = new Date(year, 0, 1 + d);
      const iso = date.toISOString().slice(0, 10);
      const minutes = lookup.get(iso) ?? 0;

      let level = 0;
      if (maxMinutes > 0 && minutes > 0) {
        const ratio = minutes / maxMinutes;
        if (ratio <= 0.15) level = 1;
        else if (ratio <= 0.35) level = 2;
        else if (ratio <= 0.55) level = 3;
        else if (ratio <= 0.80) level = 4;
        else level = 5;
      }

      currentWeek.push({ date: iso, level });

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push({ date: "", level: -1 });
      }
      weeks.push(currentWeek);
    }

    return { weeks, maxMinutes };
  }, [data, year]);

  /* month label positions */
  const monthPositions = useMemo(() => {
    const positions: { label: string; x: number }[] = [];
    let lastMonth = -1;
    grid.weeks.forEach((week, wi) => {
      for (const cell of week) {
        if (!cell.date) continue;
        const month = parseInt(cell.date.slice(5, 7), 10) - 1;
        if (month !== lastMonth) {
          positions.push({
            label: MONTH_LABELS[month],
            x: wi * (HEATMAP_CELL + HEATMAP_GAP),
          });
          lastMonth = month;
        }
        break;
      }
    });
    return positions;
  }, [grid.weeks]);

  if (data.length === 0) {
    return (
      <Card title="Reading Activity">
        <Text style={s.emptyText}>No reading sessions recorded this year</Text>
      </Card>
    );
  }

  const totalWidth =
    grid.weeks.length * (HEATMAP_CELL + HEATMAP_GAP) + HEATMAP_GAP;

  return (
    <View>
      {/* Month labels */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={[s.heatmapMonths, { width: totalWidth }]}>
            {monthPositions.map((mp) => (
              <Text
                key={mp.label + mp.x}
                style={[s.heatmapMonthLabel, { left: mp.x + 28 }]}
              >
                {mp.label}
              </Text>
            ))}
          </View>

          <View style={s.heatmapBody}>
            {/* Day labels */}
            <View style={s.heatmapDayLabels}>
              {DAY_LABELS.map((label, i) => (
                <View
                  key={i}
                  style={{
                    height: HEATMAP_CELL,
                    marginBottom: HEATMAP_GAP,
                    justifyContent: "center",
                  }}
                >
                  <Text style={s.heatmapDayLabel}>{label}</Text>
                </View>
              ))}
            </View>

            {/* Grid */}
            <View style={s.heatmapGrid}>
              {grid.weeks.map((week, wi) => (
                <View key={wi} style={s.heatmapCol}>
                  {week.map((cell, di) => (
                    <View
                      key={`${wi}-${di}`}
                      style={[
                        s.heatmapCell,
                        {
                          backgroundColor:
                            cell.level < 0
                              ? "transparent"
                              : HEATMAP_COLORS[cell.level],
                        },
                      ]}
                    />
                  ))}
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Legend */}
      <View style={s.heatmapLegend}>
        <Text style={s.heatmapLegendText}>Less</Text>
        {HEATMAP_COLORS.map((color, i) => (
          <View
            key={i}
            style={[s.heatmapLegendCell, { backgroundColor: color }]}
          />
        ))}
        <Text style={s.heatmapLegendText}>More</Text>
      </View>
    </View>
  );
}

/* ── Goal progress ring ───────────────────────────── */

function GoalRing({
  current,
  target,
  paceMessage,
}: {
  current: number;
  target: number;
  paceMessage: string;
}) {
  const SIZE = 120;
  const STROKE = 10;
  const RADIUS = (SIZE - STROKE) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const progress = Math.min(current / Math.max(target, 1), 1);
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  return (
    <View style={s.goalRingWrap}>
      <Svg width={SIZE} height={SIZE}>
        {/* Background circle */}
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={t.color.border.subtle}
          strokeWidth={STROKE}
          fill="none"
        />
        {/* Progress arc */}
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={t.color.accent.base}
          strokeWidth={STROKE}
          fill="none"
          strokeDasharray={`${CIRCUMFERENCE}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          rotation={-90}
          origin={`${SIZE / 2}, ${SIZE / 2}`}
        />
      </Svg>
      <View style={s.goalRingLabel}>
        <Text style={s.goalRingValue}>
          {current} / {target}
        </Text>
        <Text style={s.goalRingCaption}>books</Text>
      </View>
      <Text style={s.goalPaceMessage}>{paceMessage}</Text>
    </View>
  );
}

/* ── Daily progress bars ──────────────────────────── */

function DailyProgressBars({ daily }: { daily: DailyProgress }) {
  return (
    <View style={s.dailyWrap}>
      <View style={s.dailyRow}>
        <Text style={s.dailyLabel}>Pages</Text>
        <View style={s.dailyTrack}>
          <View
            style={[
              s.dailyFill,
              {
                width: `${Math.min(daily.pagePercentage, 100)}%`,
                backgroundColor: t.color.accent.base,
              },
            ]}
          />
        </View>
        <Text style={s.dailyCount}>
          {daily.pagesRead}/{daily.pageGoal}
        </Text>
      </View>
      <View style={s.dailyRow}>
        <Text style={s.dailyLabel}>Minutes</Text>
        <View style={s.dailyTrack}>
          <View
            style={[
              s.dailyFill,
              {
                width: `${Math.min(daily.minutePercentage, 100)}%`,
                backgroundColor: t.color.accent.light,
              },
            ]}
          />
        </View>
        <Text style={s.dailyCount}>
          {daily.minutesRead}/{daily.minuteGoal}
        </Text>
      </View>
    </View>
  );
}

/* ── Author leaderboard list ──────────────────────── */

function AuthorLeaderboardList({ data }: { data: AuthorStat[] }) {
  if (data.length === 0) {
    return (
      <Card title="Top Authors">
        <Text style={s.emptyText}>No data yet</Text>
      </Card>
    );
  }

  return (
    <Card title="Top Authors">
      {data.slice(0, 5).map((author, i) => (
        <View key={author.author} style={s.authorRow}>
          <View style={s.authorRank}>
            <Text style={s.authorRankText}>{i + 1}</Text>
          </View>
          <View style={s.authorInfo}>
            <Text style={s.authorName} numberOfLines={1}>
              {author.author}
            </Text>
            <Text style={s.authorMeta}>
              {author.bookCount} book{author.bookCount !== 1 ? "s" : ""} ·{" "}
              {author.totalPages.toLocaleString()} pages
              {author.avgRating > 0 ? ` · ${author.avgRating} ★` : ""}
            </Text>
          </View>
        </View>
      ))}
    </Card>
  );
}

/* ── Book length distribution bars ────────────────── */

function LengthDistribution({ data }: { data: LengthBucket[] }) {
  const max = Math.max(...data.map((b) => b.count), 1);
  const total = data.reduce((s, b) => s + b.count, 0);

  if (total === 0) {
    return (
      <Card title="Book Length Distribution">
        <Text style={s.emptyText}>No data yet</Text>
      </Card>
    );
  }

  return (
    <Card title="Book Length Distribution">
      {data.map((bucket) => (
        <View key={bucket.label} style={s.hBarRow}>
          <Text style={s.hBarLabel}>{bucket.label} pp</Text>
          <View style={s.hBarTrack}>
            <View
              style={[
                s.hBarFill,
                {
                  width: `${Math.max((bucket.count / max) * 100, 4)}%`,
                  backgroundColor: t.color.accent.light,
                },
              ]}
            />
          </View>
          <Text style={s.hBarCount}>{bucket.count}</Text>
        </View>
      ))}
    </Card>
  );
}

/* ══════════════════════════════════════════════════════
   Main screen
   ══════════════════════════════════════════════════════ */

interface AnalyticsData {
  stats: TotalStats;
  booksYear: LabeledValue[];
  pagesYear: LabeledValue[];
  streak: StreakResult;
  completion: { started: number; finished: number; rate: number };
  genres: GenreStat[];
  heatmap: HeatmapDay[];
  authors: AuthorStat[];
  avgSpeed: number;
  avgDays: number;
  lengthDist: LengthBucket[];
  goalProgress: GoalProgress | null;
  dailyProgress: DailyProgress | null;
}

export default function AnalyticsScreen() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>("year");

  const currentYear = new Date().getFullYear();

  const load = useCallback(async () => {
    const [
      stats,
      booksYear,
      pagesYear,
      streak,
      completion,
      genres,
      heatmap,
      authors,
      avgSpeed,
      avgDays,
      lengthDist,
      goalProgress,
      dailyProgress,
    ] = await Promise.all([
      totalStats(),
      booksPerYear(),
      pagesPerYear(),
      readingStreak(),
      completionRate(),
      booksPerGenre(),
      readingHeatmap(currentYear),
      authorLeaderboard(5),
      averageReadingSpeed(),
      averageDaysToFinish(),
      bookLengthDistribution(),
      getYearlyBookProgress().catch(() => null),
      getDailyProgress().catch(() => null),
    ]);

    setData({
      stats,
      booksYear,
      pagesYear,
      streak,
      completion,
      genres,
      heatmap,
      authors,
      avgSpeed,
      avgDays,
      lengthDist,
      goalProgress,
      dailyProgress,
    });
  }, [currentYear]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  /* ── Loading state ────────────────────────────────── */

  if (!data) {
    return (
      <SafeAreaView style={s.loadingWrap} edges={["top"]}>
        <ActivityIndicator color={t.color.accent.base} size="large" />
      </SafeAreaView>
    );
  }

  /* ── Render ───────────────────────────────────────── */

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={t.color.accent.base}
          />
        }
      >
        {/* ── Header ─────────────────────────────────── */}
        <Text style={s.title}>Analytics</Text>
        <Text style={s.subtitle}>Your reading at a glance</Text>

        {/* ── Time range ─────────────────────────────── */}
        <TimeRangeSelector value={timeRange} onChange={setTimeRange} />

        {/* ── Overview 2x2 grid ──────────────────────── */}
        <View style={s.statGrid}>
          <StatCard
            title="Books Finished"
            value={data.stats.total_books.toLocaleString()}
            icon="📚"
          />
          <StatCard
            title="Pages Read"
            value={data.stats.total_pages.toLocaleString()}
            icon="📖"
          />
          <StatCard
            title="Hours Read"
            value={data.stats.total_hours.toLocaleString()}
            icon="⏱"
          />
          <StatCard
            title="Avg Rating"
            value={data.stats.avg_rating > 0 ? `${data.stats.avg_rating} ★` : "—"}
            icon="⭐"
          />
        </View>

        {/* ── Goal progress ──────────────────────────── */}
        {data.goalProgress ? (
          <CollapsibleSection title="Goal Progress" defaultOpen>
            <Card>
              <GoalRing
                current={data.goalProgress.current}
                target={data.goalProgress.goal.target}
                paceMessage={data.goalProgress.paceMessage}
              />
              {data.dailyProgress ? (
                <DailyProgressBars daily={data.dailyProgress} />
              ) : null}
            </Card>
          </CollapsibleSection>
        ) : null}

        {/* ── Reading activity ───────────────────────── */}
        <CollapsibleSection title="Reading Activity" defaultOpen>
          <Card>
            <ReadingHeatmap data={data.heatmap} year={currentYear} />
          </Card>

          <View style={s.streakRow}>
            <View style={s.streakCell}>
              <Card>
                <Text style={s.streakValue}>{data.streak.current}d</Text>
                <Text style={s.streakLabel}>Current Streak</Text>
              </Card>
            </View>
            <View style={s.streakCell}>
              <Card>
                <Text style={s.streakValue}>{data.streak.longest}d</Text>
                <Text style={s.streakLabel}>Longest Streak</Text>
              </Card>
            </View>
          </View>
        </CollapsibleSection>

        {/* ── Charts ─────────────────────────────────── */}
        <CollapsibleSection title="Charts" defaultOpen={false}>
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
          <CompletionPieCard
            finished={data.completion.finished}
            dnf={data.completion.started - data.completion.finished}
            rate={data.completion.rate}
          />
          <GenreDistribution data={data.genres} />
        </CollapsibleSection>

        {/* ── Insights ───────────────────────────────── */}
        <CollapsibleSection title="Insights" defaultOpen={false}>
          <AuthorLeaderboardList data={data.authors} />

          <View style={s.insightRow}>
            <View style={s.insightCell}>
              <Card title="Avg Speed">
                <Text style={s.insightValue}>
                  {data.avgSpeed > 0 ? `${data.avgSpeed}` : "—"}
                </Text>
                <Text style={s.insightSub}>pages / hour</Text>
              </Card>
            </View>
            <View style={s.insightCell}>
              <Card title="Avg to Finish">
                <Text style={s.insightValue}>
                  {data.avgDays > 0 ? `${data.avgDays}` : "—"}
                </Text>
                <Text style={s.insightSub}>days</Text>
              </Card>
            </View>
          </View>

          <LengthDistribution data={data.lengthDist} />
        </CollapsibleSection>

        {/* Bottom spacer */}
        <View style={{ height: t.space._8 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ══════════════════════════════════════════════════════
   Styles
   ══════════════════════════════════════════════════════ */

const s = StyleSheet.create({
  /* ── Layout ───────────────────────────── */
  safe: {
    flex: 1,
    backgroundColor: t.color.bg.base,
  },
  loadingWrap: {
    flex: 1,
    backgroundColor: t.color.bg.base,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: t.space._4,
    paddingTop: t.space._4,
    paddingBottom: t.space._8,
  },

  /* ── Header ───────────────────────────── */
  title: {
    ...t.font.display,
    marginBottom: 2,
  },
  subtitle: {
    ...t.font.body,
    color: t.color.text.tertiary,
    marginBottom: t.space._4,
  },

  /* ── Time range pills ─────────────────── */
  pillRow: {
    flexDirection: "row",
    gap: t.space._2,
    marginBottom: t.space._5,
  },
  pill: {
    paddingHorizontal: t.space._4,
    paddingVertical: t.space._2,
    borderRadius: t.radius.pill,
    backgroundColor: t.color.bg.raised,
    borderWidth: 1,
    borderColor: t.color.border.subtle,
  },
  pillActive: {
    backgroundColor: t.color.accent.base,
    borderColor: t.color.accent.base,
  },
  pillText: {
    ...t.font.caption,
    color: t.color.text.secondary,
  },
  pillTextActive: {
    color: t.color.text.inverse,
  },

  /* ── Collapsible sections ─────────────── */
  section: {
    marginBottom: t.space._4,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: t.space._3,
    paddingHorizontal: t.space._1,
  },
  sectionTitle: {
    ...t.font.title,
  },
  sectionBody: {
    marginTop: t.space._2,
  },

  /* ── Card ──────────────────────────────── */
  card: {
    backgroundColor: t.color.bg.raised,
    borderRadius: t.radius["3xl"],
    padding: t.space._4,
    marginBottom: t.space._3,
    borderWidth: 1,
    borderColor: t.color.border.subtle,
    ...t.shadow.soft,
  },
  cardLabel: {
    ...t.font.label,
    marginBottom: t.space._3,
  },

  /* ── Stat grid (2x2) ──────────────────── */
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: t.space._3,
    marginBottom: t.space._5,
  },
  statCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: t.color.bg.raised,
    borderRadius: t.radius["3xl"],
    padding: t.space._4,
    borderWidth: 1,
    borderColor: t.color.border.subtle,
    alignItems: "center",
    ...t.shadow.soft,
  },
  statIcon: {
    fontSize: 20,
    marginBottom: t.space._1,
  },
  statValue: {
    fontSize: 28,
    fontWeight: "800",
    color: t.color.text.primary,
  },
  statTitle: {
    ...t.font.caption,
    marginTop: t.space._1,
    textAlign: "center",
  },
  statSub: {
    ...t.font.micro,
    marginTop: 2,
    textAlign: "center",
  },

  /* ── Empty state ───────────────────────── */
  emptyText: {
    ...t.font.body,
    color: t.color.text.tertiary,
    textAlign: "center",
    paddingVertical: t.space._6,
  },

  /* ── Bar chart legend ──────────────────── */
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: t.space._3,
    gap: t.space._4,
  },
  legendItem: {
    ...t.font.caption,
  },
  legendValue: {
    ...t.font.caption,
    color: t.color.text.primary,
    fontWeight: "700",
  },

  /* ── Pie chart ─────────────────────────── */
  pieWrap: {
    height: 180,
    alignItems: "center",
  },
  pieLegend: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: t.space._3,
    gap: t.space._6,
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

  /* ── Horizontal bar rows ───────────────── */
  hBarRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: t.space._2,
  },
  hBarLabel: {
    ...t.font.caption,
    width: 80,
    color: t.color.text.secondary,
  },
  hBarTrack: {
    flex: 1,
    height: 12,
    borderRadius: t.radius.sm,
    backgroundColor: t.color.bg.base,
    overflow: "hidden",
    marginHorizontal: t.space._2,
  },
  hBarFill: {
    height: "100%",
    borderRadius: t.radius.sm,
  },
  hBarCount: {
    ...t.font.caption,
    width: 32,
    textAlign: "right",
    color: t.color.text.primary,
    fontWeight: "700",
  },

  /* ── Heatmap ───────────────────────────── */
  heatmapMonths: {
    height: 18,
    position: "relative",
    marginBottom: t.space._1,
  },
  heatmapMonthLabel: {
    ...t.font.tiny,
    position: "absolute",
    top: 0,
  },
  heatmapBody: {
    flexDirection: "row",
  },
  heatmapDayLabels: {
    width: 24,
    marginRight: t.space._1,
  },
  heatmapDayLabel: {
    ...t.font.tiny,
    fontSize: 9,
  },
  heatmapGrid: {
    flexDirection: "row",
  },
  heatmapCol: {
    marginRight: HEATMAP_GAP,
  },
  heatmapCell: {
    width: HEATMAP_CELL,
    height: HEATMAP_CELL,
    borderRadius: 2,
    marginBottom: HEATMAP_GAP,
  },
  heatmapLegend: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginTop: t.space._2,
    gap: 3,
  },
  heatmapLegendText: {
    ...t.font.tiny,
    marginHorizontal: t.space._1,
  },
  heatmapLegendCell: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },

  /* ── Goal ring ─────────────────────────── */
  goalRingWrap: {
    alignItems: "center",
    paddingVertical: t.space._3,
  },
  goalRingLabel: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: t.space._6,
  },
  goalRingValue: {
    ...t.font.headline,
    color: t.color.text.primary,
  },
  goalRingCaption: {
    ...t.font.micro,
    color: t.color.text.tertiary,
  },
  goalPaceMessage: {
    ...t.font.caption,
    color: t.color.accent.base,
    marginTop: t.space._2,
    textAlign: "center",
  },

  /* ── Daily progress bars ───────────────── */
  dailyWrap: {
    marginTop: t.space._4,
    paddingTop: t.space._4,
    borderTopWidth: 1,
    borderTopColor: t.color.border.subtle,
  },
  dailyRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: t.space._2,
  },
  dailyLabel: {
    ...t.font.caption,
    width: 60,
    color: t.color.text.secondary,
  },
  dailyTrack: {
    flex: 1,
    height: 8,
    borderRadius: t.radius.xs,
    backgroundColor: t.color.bg.base,
    overflow: "hidden",
    marginHorizontal: t.space._2,
  },
  dailyFill: {
    height: "100%",
    borderRadius: t.radius.xs,
  },
  dailyCount: {
    ...t.font.micro,
    width: 52,
    textAlign: "right",
  },

  /* ── Streak row ────────────────────────── */
  streakRow: {
    flexDirection: "row",
    gap: t.space._3,
  },
  streakCell: {
    flex: 1,
  },
  streakValue: {
    fontSize: 32,
    fontWeight: "800",
    color: t.color.text.primary,
    textAlign: "center",
  },
  streakLabel: {
    ...t.font.caption,
    textAlign: "center",
    marginTop: t.space._1,
  },

  /* ── Author leaderboard ────────────────── */
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: t.space._2,
    borderBottomWidth: 1,
    borderBottomColor: t.color.border.subtle,
  },
  authorRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: t.color.accent.bg,
    alignItems: "center",
    justifyContent: "center",
    marginRight: t.space._3,
  },
  authorRankText: {
    ...t.font.caption,
    color: t.color.accent.strong,
    fontWeight: "800",
  },
  authorInfo: {
    flex: 1,
  },
  authorName: {
    ...t.font.body,
    fontWeight: "700",
    color: t.color.text.primary,
  },
  authorMeta: {
    ...t.font.micro,
    marginTop: 2,
  },

  /* ── Insight cards ─────────────────────── */
  insightRow: {
    flexDirection: "row",
    gap: t.space._3,
  },
  insightCell: {
    flex: 1,
  },
  insightValue: {
    fontSize: 28,
    fontWeight: "800",
    color: t.color.text.primary,
    textAlign: "center",
  },
  insightSub: {
    ...t.font.micro,
    textAlign: "center",
    marginTop: t.space._1,
  },
});
