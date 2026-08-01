/*
 * Where speed reading should start, and when that choice stops being valid.
 *
 * Pure so the lifecycle is testable — it used to be a bare number ref in
 * ReaderScreen with no owner, which produced a real bug: a caret you placed
 * and then abandoned silently hijacked the NEXT speed-reading session and
 * suppressed the resume prompt, because nothing ever cleared it.
 *
 *   placed ──▶ [pick] ──┬── consumed ─────────▶ null
 *                       ├── abandoned ────────▶ null
 *                       └── chapterChanged ──▶ null if the href differs,
 *                                              otherwise the pick survives
 *
 * `index` of 0 is a REAL pick (the first word of the chapter). The old code
 * used 0 to mean "nothing chosen", so picking the first word did nothing.
 */

export interface CaretPick {
  /** Word index within the chapter. 0 is valid. */
  index: number;
  /** Chapter the index belongs to; null when the reader did not report one. */
  href: string | null;
}

/** No pick outstanding. */
export type CaretState = CaretPick | null;

export type CaretEvent =
  /** The reader placed a caret on a word. */
  | { type: "placed"; index: number; href: string | null }
  /** Picking was cancelled, or the reader moved on without starting. */
  | { type: "abandoned" }
  /** Speed reading started from the pick. */
  | { type: "consumed" }
  /** The book moved; a pick from another chapter is meaningless. */
  | { type: "chapterChanged"; href: string | null };

export function nextCaretState(
  current: CaretState,
  event: CaretEvent
): CaretState {
  switch (event.type) {
    case "placed":
      return { index: event.index, href: event.href };
    case "abandoned":
    case "consumed":
      return null;
    case "chapterChanged":
      if (!current) return null;
      // A pick with no known chapter cannot be validated, so it does not
      // survive navigation — better to start at the top than the wrong word.
      if (current.href == null) return null;
      return current.href === event.href ? current : null;
  }
}

/**
 * The word index speed reading should open at, or null to use the normal
 * start/resume path. Clamps into the chapter: a pick can outlive the text it
 * referred to if the chapter re-rendered shorter.
 */
export function startIndexFor(
  state: CaretState,
  href: string | null,
  tokenCount: number
): number | null {
  if (!state || tokenCount <= 0) return null;
  if (state.href != null && href != null && state.href !== href) return null;
  if (state.index < 0 || state.index >= tokenCount) return null;
  return state.index;
}
