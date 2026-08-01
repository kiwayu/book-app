/*
 * Pure gesture decisions for the reading surface.
 *
 * Lives at the RN layer, not inside the WebView: in-iframe touch/click
 * detection does not fire reliably across Android WebView + epub.js
 * versions (three device reports), so the native overlay owns every gesture.
 *
 * Pure on purpose. ReaderScreen has no test coverage and gesture behaviour
 * cannot be exercised without a device, so every decision that CAN be a
 * function lives here where a unit test can reach it.
 *
 *   press ─┬─ travel > SWIPE_MIN horizontally ──▶ direction decides
 *          │                                      (right-to-left = next)
 *          └─ anything less ────────────────────▶ ORIGIN zone decides
 *                                                 (where the finger landed,
 *                                                  never where it lifted)
 */

/** Which reader action a screen tap maps to. */
export type TapZone = "prev" | "next" | "menu";

/** What a completed gesture resolves to. "none" = deliberately ignored. */
export type GestureResult = TapZone | "none";

export interface Point {
  x: number;
  y: number;
}

/**
 * Horizontal travel, in px, before a drag counts as a swipe. Lifted from the
 * in-WebView handler this replaces so the feel is what was originally intended.
 */
export const SWIPE_MIN = 40;

/** Left third = previous page, right third = next page, middle = menu. */
export function tapZone(x: number, width: number): TapZone {
  if (width <= 0) return "menu";
  if (x < width / 3) return "prev";
  if (x > (width * 2) / 3) return "next";
  return "menu";
}

/**
 * Resolve a completed gesture.
 *
 * Scoring taps from `origin` rather than the release point is the whole fix:
 * previously any drag was read as a tap wherever the finger happened to lift,
 * so dragging right across the screen turned the page FORWARD when the user
 * meant to go back, and a small drag out of the left third opened the menu.
 *
 * @param origin  where the finger landed; null if the gesture was interrupted
 *                before an origin was recorded, in which case we fall back to
 *                the release point rather than guessing
 * @param multiTouch true if a second finger was seen at any point — the
 *                responder reports one release position, so with two fingers
 *                down the delta spans the GAP BETWEEN FINGERS and would read
 *                as a confident swipe. Refuse to act instead.
 */
export function classifyGesture(
  origin: Point | null,
  release: Point,
  width: number,
  multiTouch = false
): GestureResult {
  if (multiTouch) return "none";

  const from = origin ?? release;
  const dx = release.x - from.x;
  const dy = release.y - from.y;

  // Swipe: horizontal travel past the threshold, and more horizontal than
  // vertical so a scroll-ish drag never turns a page.
  if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) {
    return dx < 0 ? "next" : "prev";
  }

  return tapZone(from.x, width);
}
