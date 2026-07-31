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
  AccessibilityInfo,
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

/* Chapter intro hold, measured in word slots rather than milliseconds: a fixed
   2s reads as a stall at 250 WPM and a jolt at 600. Clamped so it stays a beat
   at either extreme. */
const INTRO_WORD_SLOTS = 6;
const INTRO_MIN_MS = 1200;
const INTRO_MAX_MS = 2500;

function introHoldMs(wpm: number): number {
  const raw = INTRO_WORD_SLOTS * (60000 / wpm);
  return Math.max(INTRO_MIN_MS, Math.min(INTRO_MAX_MS, raw));
}

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
  /** Called when playback reaches the last word (parent loads the next chapter). */
  onFinish?: () => void;
  /**
   * Set when these tokens arrived from a chapter advance. The label is held in
   * the word slot, then playback resumes on its own. Absent = a normal open,
   * which stays paused.
   */
  introLabel?: string;
  /** A chapter advance is walking the spine; nothing is playable yet. */
  advancing?: boolean;
  /** No chapter left to advance into. */
  endOfBook?: boolean;
  /** Shown in the end-of-book message. */
  bookTitle?: string;
  /** End-of-book: return to the chapter just finished instead of closing. */
  onBackToChapter?: () => void;
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
  onFinish,
  introLabel,
  advancing = false,
  endOfBook = false,
  bookTitle,
  onBackToChapter,
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

  /* Kept in a ref so the parent handing us a new callback never restarts the
     rAF loop (a restart mid-word would re-read the clock for nothing). */
  const finishRef = useRef(onFinish);
  useEffect(() => { finishRef.current = onFinish; }, [onFinish]);

  /* ── accessibility ─────────────────────────────────
     An auto-dismissing timer is a trap for anyone who cannot read it in time.
     Screen reader on => never auto-resume, wait for a deliberate play.
     Reduce motion on => no crossfade, and treat the hold as a stop too: the
     setting signals "do not move things at me on your schedule". */
  const [a11y, setA11y] = useState({ screenReader: false, reduceMotion: false });
  const a11yRef = useRef(a11y);
  useEffect(() => {
    let alive = true;
    Promise.all([
      AccessibilityInfo.isScreenReaderEnabled(),
      AccessibilityInfo.isReduceMotionEnabled(),
    ])
      .then(([screenReader, reduceMotion]) => {
        if (!alive) return;
        const cur = a11yRef.current;
        // Both settings off is the common case and matches the initial state.
        // Skip the dispatch entirely rather than scheduling a render that
        // resolves to the same values.
        if (cur.screenReader === screenReader && cur.reduceMotion === reduceMotion) {
          return;
        }
        a11yRef.current = { screenReader, reduceMotion };
        setA11y(a11yRef.current);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const autoResumeAllowed = !a11y.screenReader && !a11y.reduceMotion;

  /* ── chapter intro ─────────────────────────────────
     The label is held in the word slot, never on a card: RSVP's whole premise
     is that the eye does not move, and a card would move it at the one moment
     the reader is mid-flow. The progress track doubles as the countdown, so
     the resume reads as caused rather than random. */
  const [intro, setIntro] = useState(!!introLabel);
  const [introLeft, setIntroLeft] = useState(1); // 1 → 0
  const introRafRef = useRef<number | null>(null);

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
        finishRef.current?.();
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

  /** Tap during the intro: stay here, paused at word 0. */
  const cancelIntro = useCallback(() => {
    if (introRafRef.current != null) cancelAnimationFrame(introRafRef.current);
    introRafRef.current = null;
    setIntro(false);
    setIntroLeft(0);
  }, []);

  /* Hold the chapter label, drain the countdown, then resume on our own.
     Declared after `play` so the dependency array can name it. */
  useEffect(() => {
    if (!intro) return;
    if (introLabel) AccessibilityInfo.announceForAccessibility?.(introLabel);
    if (!autoResumeAllowed) return; // held indefinitely; tap to continue
    const hold = introHoldMs(wpmRef.current);
    const started = now();
    const tick = () => {
      // A frame can already be queued when the reader taps to stay. Cancelling
      // clears this ref, so a tick that slips through must not start playback.
      if (introRafRef.current == null) return;
      const left = 1 - (now() - started) / hold;
      if (left <= 0) {
        setIntroLeft(0);
        setIntro(false);
        play();
        return;
      }
      setIntroLeft(left);
      introRafRef.current = requestAnimationFrame(tick);
    };
    introRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (introRafRef.current != null) cancelAnimationFrame(introRafRef.current);
      introRafRef.current = null;
    };
  }, [intro, introLabel, autoResumeAllowed, play]);

  const toggle = useCallback(() => {
    // Order matters: the intro owns the tap while it is up.
    if (intro) { cancelIntro(); return; }
    if (advancing) return;              // nothing to play yet
    if (finished) restart();
    else if (playing) pause();
    else play();
  }, [intro, cancelIntro, advancing, finished, playing, play, pause, restart]);

  const handleClose = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    onClose(indexRef.current);
  }, [onClose]);

  /* ── derived render values ─────────────────────────── */
  /* One of these owns the word slot at a time. Everything below the stage
     (transport, WPM, presets) stays mounted through all of them — the moment a
     reader most wants to slow down is the moment a card would hide the
     controls. */
  const slot: "word" | "intro" | "advancing" | "done" =
    endOfBook ? "done" : advancing ? "advancing" : intro ? "intro" : "word";

  const currentWord = count > 0 ? tokens[clampIndex(index)].word : "";
  const prevWord = index > 0 && slot === "word" ? tokens[index - 1].word : "";
  const nextWord =
    index + 1 < count && slot === "word" ? tokens[index + 1].word : "";
  const parts = useMemo(() => splitOrp(currentWord), [currentWord]);
  /* During the intro the track is the countdown, so the resume reads as caused
     rather than random. Same pixels, no extra chrome. */
  const progressPct =
    slot === "intro"
      ? introLeft * 100
      : count > 0
        ? ((index + 1) / count) * 100
        : 0;

  const slotText =
    slot === "done"
      ? bookTitle ? `You finished ${bookTitle}` : "You finished the book"
      : slot === "advancing"
        ? "Next chapter…"
        : slot === "intro"
          ? introLabel || ""
          : "";

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
        {/* While playing this label changes several times a second, which a
            screen reader would read as an unbroken firehose. Hide it during
            playback; paused and intro states stay announceable. */}
        <View
          style={st.wordRow}
          testID="rsvp-word"
          accessibilityLabel={currentWord}
          accessibilityElementsHidden={playing}
          importantForAccessibility={playing ? "no-hide-descendants" : "auto"}
        >
          {/* Prev word — dimmed, locked to the left gutter (inner edge fixed
              outside the focus band → can never overlap the focus word) */}
          <Text
            style={[st.contextSide, st.contextLeft, { color: colors.fg }]}
            numberOfLines={1}
          >
            {prevWord}
          </Text>

          {/* Focus word — one line, auto-shrinks to fit the central band so it
              is NEVER truncated or ellipsised (adjustsFontSizeToFit scales the
              font down instead of clipping). The ORP letter is coloured inline.
              The band width keeps it clear of the prev/next gutters.
              Chapter labels and end-of-book share this slot so the eye never
              has to travel to a new surface. */}
          <View style={st.wordBand}>
            {slot === "word" ? (
              <Text
                testID="rsvp-focus"
                style={[st.wordLine, { color: colors.fg }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.3}
              >
                {parts.left}
                <Text style={{ color: colors.accent, fontWeight: "700" }}>
                  {parts.focus}
                </Text>
                {parts.right}
              </Text>
            ) : (
              <Text
                testID="rsvp-slot"
                style={[
                  st.slotLine,
                  { color: slot === "advancing" ? colors.sub : colors.fg },
                ]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.4}
                accessibilityLiveRegion="polite"
              >
                {slotText}
              </Text>
            )}
          </View>

          {/* Next word — dimmed, locked to the right gutter */}
          <Text
            style={[st.contextSide, st.contextRight, { color: colors.fg }]}
            numberOfLines={1}
          >
            {nextWord}
          </Text>
        </View>
        <View style={[st.tick, st.tickBottom, { backgroundColor: colors.accent }]} />

        {!playing && (
          <Text style={[st.hint, { color: colors.sub }]}>
            {slot === "done"
              ? "Done, or go back to the last chapter"
              : slot === "advancing"
                ? "Finding the next chapter"
                : slot === "intro"
                  ? autoResumeAllowed
                    ? "Tap to stay here"
                    : "Tap to start the chapter"
                  : finished
                    ? "Finished — tap restart"
                    : "Tap to play"}
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
          {slot === "done"
            ? `${wpm} WPM`
            : `${index + 1} / ${count} words · ${wpm} WPM`}
        </Text>
      </View>

      {/* Transport controls. Present in every state — disabled, never hidden,
          so the layout does not jump and the controls stay where the hand
          expects them. */}
      {slot === "done" ? (
        <View style={st.controls}>
          <Pressable
            style={[st.endBtn, { borderColor: colors.border }]}
            onPress={onBackToChapter}
            testID="rsvp-back-chapter"
          >
            <Text style={[st.endBtnTxt, { color: colors.fg }]}>
              Last chapter
            </Text>
          </Pressable>
          <Pressable
            style={[st.endBtn, { backgroundColor: colors.accent, borderColor: colors.accent }]}
            onPress={handleClose}
            testID="rsvp-done"
          >
            <Text style={[st.endBtnTxt, { color: "#fff" }]}>Done</Text>
          </Pressable>
        </View>
      ) : (
        <View style={st.controls}>
          <Pressable
            style={[st.ctrlBtn, advancing && st.disabled]}
            onPress={() => seek(-SEEK_WORDS)}
            disabled={advancing}
            hitSlop={8}
          >
            <Text style={[st.ctrlTxt, { color: colors.fg }]}>«</Text>
          </Pressable>

          <Pressable
            style={[
              st.playBtn,
              { backgroundColor: colors.accent },
              advancing && st.disabled,
            ]}
            onPress={toggle}
            disabled={advancing}
            testID="rsvp-playpause"
          >
            <Text style={st.playTxt}>
              {intro ? "❚❚" : finished ? "↻" : playing ? "❚❚" : "▶"}
            </Text>
          </Pressable>

          <Pressable
            style={[st.ctrlBtn, advancing && st.disabled]}
            onPress={() => seek(SEEK_WORDS)}
            disabled={advancing}
            hitSlop={8}
          >
            <Text style={[st.ctrlTxt, { color: colors.fg }]}>»</Text>
          </Pressable>
        </View>
      )}

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
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    // gutter words bleed off-screen; the screen clips them
    overflow: "visible",
  },
  /* Central band the focus word lives in — 62% of width, centred, clear of the
     prev/next gutters. NOT clipped: the word auto-shrinks to fit instead. */
  wordBand: {
    width: "62%",
    alignItems: "center",
    justifyContent: "center",
  },
  wordLine: {
    fontFamily: MONO,
    fontSize: 40,
    letterSpacing: 1,
    textAlign: "center",
  },
  /* Chapter label / end-of-book share the word slot. Not monospace: this is
     prose, and the difference makes it read as "not a word in the stream". */
  slotLine: {
    fontSize: 24,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 32,
  },
  disabled: {
    opacity: 0.35,
  },
  endBtn: {
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  endBtnTxt: {
    fontSize: 15,
    fontWeight: "700",
  },
  /* prev/next words flank the focus, absolutely placed so they never shift
     the ORP-centered word; unconstrained width lets long words bleed off-edge */
  contextSide: {
    position: "absolute",
    top: "50%",
    transform: [{ translateY: -16 }],
    fontFamily: MONO,
    fontSize: 22,
    letterSpacing: 1,
    opacity: 0.22,
  },
  contextLeft: {
    right: "82%",
    textAlign: "right",
  },
  contextRight: {
    left: "82%",
    textAlign: "left",
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
