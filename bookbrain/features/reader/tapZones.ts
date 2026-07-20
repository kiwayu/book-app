/*
 * Which reader action a screen tap maps to. Left third = previous page,
 * right third = next page, middle = show menu/options.
 *
 * Lives at the RN layer, not inside the WebView: in-iframe touch/click
 * detection does not fire reliably across Android WebView + epub.js
 * versions (three device reports), so the native overlay owns taps.
 */
export type TapZone = "prev" | "next" | "menu";

export function tapZone(x: number, width: number): TapZone {
  if (width <= 0) return "menu";
  if (x < width / 3) return "prev";
  if (x > (width * 2) / 3) return "next";
  return "menu";
}
