/*
 * RSVP speed-reading overlay — the UI consumer of engine.ts.
 *
 * A requestAnimationFrame loop indexes the schedule by elapsed time
 * (visible word = wordIndexAt(schedule, now - clockStart)), so dropped
 * frames self-correct instead of accumulating drift. WPM changes rebuild
 * the schedule from the current word and reset the clock, so the slider
 * never skips a word (eng review D19). The ORP focal letter is pinned to
 * a constant x; only the surrounding text shifts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  schedule,
  wordIndexAt,
  isFinished,
  splitOrp,
  type Schedule,
  type Token,
} from "./engine";

const WPM_MIN = 100;
const WPM_MAX = 900;
const WPM_STEP = 25;
const PRESETS = [250, 350, 450, 600];
const SEEK_WORDS = 5;

const MONO = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

export interface RsvpColors {
  bg: string;
  fg: string;
  sub: string;
  accent: string;
  barBg: string;
  border: string;
}

interface RsvpOverlayProps {
  tokens: Token[];
  initialWpm: number;
  startIndex?: number;
  chapter?: string;
  colors: RsvpColors;
  onWpmChange?: (wpm: number) => void;
  /** Called on close with the last word index reached (for resume). */
  onClose: (lastIndex: number) => void;
}

const now = () => Date.now();

export default function RsvpOverlay({
  tokens,
  initialWpm,
  startIndex = 0,
  chapter,
  colors,
  onWpmChange,
  onClose,
}: RsvpOverlayProps) {
  const count = tokens.length;
  const clampIndex = useCallback(
    (i: number) => Math.max(0, Math.min(count - 1, i)),
    [count]
  );
  const clampWpm = (w: number) => Math.max(WPM_MIN, Math.min(WPM_MAX, w));

  const [wpm, setWpm] = useState(() => clampWpm(initialWpm));
  const [index, setIndex] = useState(() => clampIndex(startIndex));
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);

  const wpmRef = useRef(wpm);
  const indexRef = useRef(index);
  const scheduleRef = useRef<Schedule>(schedule(tokens, wpm, clampIndex(startIndex)));
  const clockStartRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  /* ── rAF playback loop ─────────────────────────────── */
  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      const elapsed = now() - clockStartRef.current;
      const idx = wordIndexAt(scheduleRef.current, elapsed);
      indexRef.current = idx;
      setIndex(idx);
      if (isFinished(scheduleRef.current, elapsed)) {
        setPlaying(false);
        setFinished(true);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [playing]);

  /* ── transport ─────────────────────────────────────── */

  const play = useCallback(() => {
    if (count === 0) return;
    let start = indexRef.current;
    if (start >= count) start = 0; // restart after a finish
    indexRef.current = start;
    scheduleRef.current = schedule(tokens, wpmRef.current, start);
    clockStartRef.current = now();
    setFinished(false);
    setIndex(start);
    setPlaying(true);
  }, [tokens, count]);

  const pause = useCallback(() => setPlaying(false), []);

  const changeWpm = useCallback(
    (next: number) => {
      const w = clampWpm(next);
      if (w === wpmRef.current) return;
      wpmRef.current = w;
      setWpm(w);
      onWpmChange?.(w);
      if (count === 0) return;
      // Reschedule from the current word so nothing skips; reset the clock.
      scheduleRef.current = schedule(tokens, w, clampIndex(indexRef.current));
      clockStartRef.current = now();
    },
    [tokens, count, clampIndex, onWpmChange]
  );

  const seek = useCallback(
    (delta: number) => {
      if (count === 0) return;
      const next = clampIndex(indexRef.current + delta);
      indexRef.current = next;
      setIndex(next);
      setFinished(false);
      scheduleRef.current = schedule(tokens, wpmRef.current, next);
      clockStartRef.current = now();
    },
    [tokens, count, clampIndex]
  );

  const restart = useCallback(() => {
    if (count === 0) return;
    indexRef.current = 0;
    scheduleRef.current = schedule(tokens, wpmRef.current, 0);
    clockStartRef.current = now();
    setIndex(0);
    setFinished(false);
    setPlaying(true);
  }, [tokens, count]);

  const toggle = useCallback(() => {
    if (finished) restart();
    else if (playing) pause();
    else play();
  }, [finished, playing, play, pause, restart]);

  const handleClose = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    onClose(indexRef.current);
  }, [onClose]);

  /* ── derived render values ─────────────────────────── */
  const currentWord = count > 0 ? tokens[clampIndex(index)].word : "";
  const parts = useMemo(() => splitOrp(currentWord), [currentWord]);
  const progressPct = count > 0 ? ((index + 1) / count) * 100 : 0;

  /* ── empty chapter ─────────────────────────────────── */
  if (count === 0) {
    return (
      <SafeAreaView style={[st.root, { backgroundColor: colors.bg }]}>
        <Pressable style={st.closeBtn} onPress={handleClose} hitSlop={12}>
          <Text style={[st.closeTxt, { color: colors.fg }]}>✕</Text>
        </Pressable>
        <View style={st.center}>
          <Text style={[st.emptyTxt, { color: colors.sub }]}>
            No readable text found in this chapter.
          </Text>
          <Pressable
            style={[st.primaryBtn, { borderColor: colors.accent }]}
            onPress={handleClose}
          >
            <Text style={[st.primaryBtnTxt, { color: colors.accent }]}>
              Back to reading
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[st.root, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={st.header}>
        <Text style={[st.chapter, { color: colors.sub }]} numberOfLines={1}>
          {chapter || "Speed Reading"}
        </Text>
        <Pressable
          style={st.closeBtn}
          onPress={handleClose}
          hitSlop={12}
          testID="rsvp-close"
        >
          <Text style={[st.closeTxt, { color: colors.fg }]}>✕</Text>
        </Pressable>
      </View>

      {/* Word stage — tap to play/pause */}
      <Pressable style={st.stage} onPress={toggle} testID="rsvp-stage">
        {/* ORP guide ticks */}
        <View style={[st.tick, st.tickTop, { backgroundColor: colors.accent }]} />
        <View
          style={st.wordRow}
          testID="rsvp-word"
          accessibilityLabel={currentWord}
        >
          <Text
            style={[st.wordSide, st.wordRight, { color: colors.fg }]}
            numberOfLines={1}
          >
            {parts.left}
          </Text>
          <Text style={[st.wordFocus, { color: colors.accent }]}>
            {parts.focus}
          </Text>
          <Text
            style={[st.wordSide, st.wordLeft, { color: colors.fg }]}
            numberOfLines={1}
          >
            {parts.right}
          </Text>
        </View>
        <View style={[st.tick, st.tickBottom, { backgroundColor: colors.accent }]} />

        {!playing && (
          <Text style={[st.hint, { color: colors.sub }]}>
            {finished ? "Finished — tap restart" : "Tap to play"}
          </Text>
        )}
      </Pressable>

      {/* Progress */}
      <View style={st.progressWrap}>
        <View style={[st.progressTrack, { backgroundColor: colors.border }]}>
          <View
            style={[
              st.progressFill,
              {
                backgroundColor: colors.accent,
                width: `${progressPct}%` as `${number}%`,
              },
            ]}
          />
        </View>
        <Text style={[st.progressTxt, { color: colors.sub }]}>
          {index + 1} / {count} words · {wpm} WPM
        </Text>
      </View>

      {/* Transport controls */}
      <View style={st.controls}>
        <Pressable
          style={st.ctrlBtn}
          onPress={() => seek(-SEEK_WORDS)}
          hitSlop={8}
        >
          <Text style={[st.ctrlTxt, { color: colors.fg }]}>«</Text>
        </Pressable>

        <Pressable
          style={[st.playBtn, { backgroundColor: colors.accent }]}
          onPress={toggle}
          testID="rsvp-playpause"
        >
          <Text style={st.playTxt}>
            {finished ? "↻" : playing ? "❚❚" : "▶"}
          </Text>
        </Pressable>

        <Pressable
          style={st.ctrlBtn}
          onPress={() => seek(SEEK_WORDS)}
          hitSlop={8}
        >
          <Text style={[st.ctrlTxt, { color: colors.fg }]}>»</Text>
        </Pressable>
      </View>

      {/* WPM stepper */}
      <View style={st.wpmRow}>
        <Pressable
          style={[st.wpmStep, { borderColor: colors.border }]}
          onPress={() => changeWpm(wpm - WPM_STEP)}
          testID="rsvp-wpm-dec"
        >
          <Text style={[st.wpmStepTxt, { color: colors.fg }]}>−</Text>
        </Pressable>
        <Text style={[st.wpmValue, { color: colors.fg }]}>{wpm} WPM</Text>
        <Pressable
          style={[st.wpmStep, { borderColor: colors.border }]}
          onPress={() => changeWpm(wpm + WPM_STEP)}
          testID="rsvp-wpm-inc"
        >
          <Text style={[st.wpmStepTxt, { color: colors.fg }]}>+</Text>
        </Pressable>
      </View>

      {/* WPM presets */}
      <View style={st.presetRow}>
        {PRESETS.map((p) => {
          const active = p === wpm;
          return (
            <Pressable
              key={p}
              style={[
                st.preset,
                { borderColor: active ? colors.accent : colors.border },
                active && { backgroundColor: colors.barBg },
              ]}
              onPress={() => changeWpm(p)}
            >
              <Text
                style={[
                  st.presetTxt,
                  { color: active ? colors.accent : colors.sub },
                ]}
              >
                {p}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  chapter: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  closeTxt: {
    fontSize: 18,
    fontWeight: "600",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyTxt: {
    fontSize: 15,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 22,
  },
  primaryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  primaryBtnTxt: {
    fontSize: 14,
    fontWeight: "700",
  },

  /* word stage */
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tick: {
    width: 2,
    height: 14,
  },
  tickTop: {
    marginBottom: 10,
  },
  tickBottom: {
    marginTop: 10,
  },
  wordRow: {
    flexDirection: "row",
    alignItems: "baseline",
    width: "100%",
    paddingHorizontal: 16,
  },
  wordSide: {
    flex: 1,
    fontFamily: MONO,
    fontSize: 40,
    letterSpacing: 1,
  },
  wordRight: {
    textAlign: "right",
  },
  wordLeft: {
    textAlign: "left",
  },
  wordFocus: {
    fontFamily: MONO,
    fontSize: 40,
    fontWeight: "700",
    letterSpacing: 1,
    textAlign: "center",
  },
  hint: {
    position: "absolute",
    bottom: 24,
    fontSize: 13,
  },

  /* progress */
  progressWrap: {
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  progressTrack: {
    height: 3,
    borderRadius: 1.5,
    overflow: "hidden",
  },
  progressFill: {
    height: 3,
    borderRadius: 1.5,
  },
  progressTxt: {
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
    marginTop: 8,
  },

  /* transport */
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 36,
    marginBottom: 16,
  },
  ctrlBtn: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  ctrlTxt: {
    fontSize: 30,
    fontWeight: "300",
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  playTxt: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
  },

  /* wpm */
  wpmRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    marginBottom: 12,
  },
  wpmStep: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  wpmStepTxt: {
    fontSize: 22,
    fontWeight: "600",
  },
  wpmValue: {
    fontSize: 16,
    fontWeight: "700",
    minWidth: 96,
    textAlign: "center",
  },
  presetRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  preset: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  presetTxt: {
    fontSize: 13,
    fontWeight: "700",
  },
});
