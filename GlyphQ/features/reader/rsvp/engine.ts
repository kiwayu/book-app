/*
 * RSVP engine — pure functions, zero dependencies. (Design doc workstream 2)
 *
 * Timeline model (eng review 7A + D19):
 *
 *   tokens:     [ w0 ][ w1 ][ w2 ][ w3 ] ...
 *   durations:  [ d0 ][ d1 ][ d2 ][ d3 ]      durationFor(token, wpm)
 *   cumEnd:     [ d0 ][d0+d1][d0+d1+d2] ...   buildSchedule(durations)
 *
 *   The overlay runs a requestAnimationFrame loop:
 *     visible word = offset + wordIndexAt(cumEnd, now - clockStart)
 *   Late frames self-correct (we index by elapsed time, we never step).
 *
 *   Mid-stream WPM changes re-call schedule(tokens, newWpm, currentIndex)
 *   and reset the clock, so the slider never skips words: the current
 *   word restarts its clock at 0 (eng review D19).
 *
 * ORP (Optimal Recognition Point): the focal letter, slightly left of
 * center, pinned to a constant x by the overlay. Index rule ported from
 * OpenSpritz (MIT).
 */

export interface Token {
  /** Word exactly as displayed (punctuation attached). */
  word: string;
  /** Index of the paragraph this word belongs to (CFI anchoring). */
  paragraphIndex: number;
  /** True for the last word of a paragraph (longer pause). */
  isParagraphEnd: boolean;
}

export interface Schedule {
  /** Token index the schedule starts from (t=0 shows tokens[offset]). */
  offset: number;
  /** cumEnd[i] = elapsed ms at which word (offset+i) stops displaying. */
  cumEnd: number[];
}

/* ── Pacing constants ─────────────────────────────────────────────
 * Multipliers are deliberately conservative; users control raw speed
 * with the WPM slider, these only shape rhythm. */
export const PACING = {
  CLAUSE_PAUSE: 1.8,     // , ; :
  SENTENCE_PAUSE: 2.2,   // . ! ? …
  PARAGRAPH_PAUSE: 2.8,  // last word of a paragraph
  LONG_WORD: 1.3,        // >= 9 visible chars
  VERY_LONG_WORD: 1.5,   // >= 13 visible chars
  NUMBER: 1.4,           // contains a digit
} as const;

const TRAILING_PUNCT = /["'’”)\]]*$/;
const SENTENCE_END = /[.!?…]["'’”)\]]*$/;
const CLAUSE_END = /[,;:]["'’”)\]]*$/;
const EM_DASH = "—";

/* ── Tokenization ───────────────────────────────────────────────── */

/**
 * Split one paragraph of text into displayable words.
 * - whitespace-delimited; blank input yields []
 * - em-dashes split into separate tokens, dash staying with the left
 *   word ("war—peace" -> "war—", "peace") so the pause reads naturally
 * - hyphenated compounds ("well-known") stay one token
 * - quotes and other punctuation stay attached to their word
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const raw of text.split(/\s+/)) {
    if (!raw) continue;
    if (raw.includes(EM_DASH)) {
      // "a—b" -> "a—", "b"; standalone "—" survives as its own token
      const parts = raw.split(EM_DASH);
      for (let i = 0; i < parts.length - 1; i++) {
        if (parts[i]) out.push(parts[i] + EM_DASH);
        else if (i === 0) out.push(EM_DASH);
      }
      if (parts[parts.length - 1]) out.push(parts[parts.length - 1]);
    } else {
      out.push(raw);
    }
  }
  return out;
}

/** Tokenize a chapter given its paragraphs; marks paragraph ends. */
export function tokenizeParagraphs(paragraphs: string[]): Token[] {
  const tokens: Token[] = [];
  paragraphs.forEach((text, paragraphIndex) => {
    const words = tokenize(text);
    words.forEach((word, i) => {
      tokens.push({
        word,
        paragraphIndex,
        isParagraphEnd: i === words.length - 1,
      });
    });
  });
  return tokens;
}

/* ── ORP ────────────────────────────────────────────────────────── */

/**
 * Index of the focal (ORP) letter. OpenSpritz rule by length:
 * 1 char -> 0, 2-5 -> 1, 6-9 -> 2, 10-13 -> 3, longer -> 4.
 * Clamped to the last character for safety on punctuation-only tokens.
 */
export function orpIndex(word: string): number {
  const len = word.length;
  if (len <= 1) return 0;
  let idx: number;
  if (len <= 5) idx = 1;
  else if (len <= 9) idx = 2;
  else if (len <= 13) idx = 3;
  else idx = 4;
  return Math.min(idx, len - 1);
}

export interface OrpParts {
  /** Characters before the focal letter. */
  left: string;
  /** The focal (ORP) letter, pinned to a constant x by the overlay. */
  focus: string;
  /** Characters after the focal letter. */
  right: string;
}

/**
 * Split a word into the three segments the overlay renders: everything
 * left of the ORP letter, the ORP letter itself, and everything right.
 * The overlay pins `focus` to a fixed x so the eye never moves. Empty
 * input yields three empty strings.
 */
export function splitOrp(word: string): OrpParts {
  if (!word) return { left: "", focus: "", right: "" };
  const idx = orpIndex(word);
  return {
    left: word.slice(0, idx),
    focus: word.charAt(idx),
    right: word.slice(idx + 1),
  };
}

/* ── Durations ──────────────────────────────────────────────────── */

function visibleLength(word: string): number {
  return word.replace(TRAILING_PUNCT, "").length;
}

/** Display duration in ms for one token at the given WPM. */
export function durationFor(token: Token, wpm: number): number {
  if (wpm <= 0) throw new RangeError(`wpm must be positive, got ${wpm}`);
  const base = 60000 / wpm;

  // Pause multipliers: take the strongest applicable, don't stack pauses.
  let pause = 1;
  if (token.isParagraphEnd) pause = PACING.PARAGRAPH_PAUSE;
  else if (SENTENCE_END.test(token.word)) pause = PACING.SENTENCE_PAUSE;
  else if (CLAUSE_END.test(token.word)) pause = PACING.CLAUSE_PAUSE;

  // Complexity multipliers stack multiplicatively with the pause.
  let complexity = 1;
  const len = visibleLength(token.word);
  if (len >= 13) complexity *= PACING.VERY_LONG_WORD;
  else if (len >= 9) complexity *= PACING.LONG_WORD;
  if (/\d/.test(token.word)) complexity *= PACING.NUMBER;

  return base * pause * complexity;
}

/* ── Scheduling ─────────────────────────────────────────────────── */

/** Schedule for tokens[fromIndex..] at the given WPM; t=0 = fromIndex. */
export function schedule(
  tokens: Token[],
  wpm: number,
  fromIndex = 0
): Schedule {
  if (fromIndex < 0 || fromIndex > tokens.length) {
    throw new RangeError(
      `fromIndex ${fromIndex} out of range 0..${tokens.length}`
    );
  }
  const cumEnd: number[] = [];
  let acc = 0;
  for (let i = fromIndex; i < tokens.length; i++) {
    acc += durationFor(tokens[i], wpm);
    cumEnd.push(acc);
  }
  return { offset: fromIndex, cumEnd };
}

/**
 * Absolute token index that should be visible at `elapsedMs` since the
 * schedule's clock origin. Binary search; clamps past-the-end to the
 * final word (callers detect completion via isFinished).
 */
export function wordIndexAt(sched: Schedule, elapsedMs: number): number {
  const { cumEnd, offset } = sched;
  if (cumEnd.length === 0) return offset;
  if (elapsedMs < 0) return offset;
  // first i with cumEnd[i] > elapsedMs
  let lo = 0;
  let hi = cumEnd.length - 1;
  if (elapsedMs >= cumEnd[hi]) return offset + hi;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumEnd[mid] > elapsedMs) hi = mid;
    else lo = mid + 1;
  }
  return offset + lo;
}

/** True when the schedule has fully elapsed. */
export function isFinished(sched: Schedule, elapsedMs: number): boolean {
  const { cumEnd } = sched;
  return cumEnd.length === 0 || elapsedMs >= cumEnd[cumEnd.length - 1];
}

/** Total runtime of a schedule in ms (0 for an empty schedule). */
export function totalDuration(sched: Schedule): number {
  return sched.cumEnd.length === 0 ? 0 : sched.cumEnd[sched.cumEnd.length - 1];
}
