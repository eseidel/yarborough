/**
 * The look of the app in one place.
 *
 * Two rules hold the palette together. The deck owns four colors — blue
 * clubs, orange diamonds, red hearts, black spades — and the redouble is
 * blue as it is on a bidding box, so the interface itself never spends
 * those: its chrome is grey, its one accent is emerald, and red and amber
 * are kept for what they mean (off system, vulnerable, a hint taken). And
 * every panel is the same surface, so a screen reads as one stack rather
 * than as a pile of differently weighted boxes.
 */

/** Every panel on every screen: the page's one surface. */
export const CARD = "rounded-xl border border-gray-200 bg-white shadow-sm";

/** The small capitals that name a section. */
export const EYEBROW =
  "text-xs font-semibold uppercase tracking-wider text-gray-500";

/** Text that acts: the accent, never a suit's color. */
export const LINK =
  "font-medium text-emerald-700 hover:text-emerald-900 hover:underline underline-offset-2";

/** The same, at the size of the text it sits in the middle of. */
export const LINK_SMALL = `${LINK} text-xs`;

/** The one call to action of a screen. */
export const PRIMARY_BUTTON =
  "min-h-11 rounded-lg bg-emerald-700 px-4 font-semibold text-base text-white transition-colors hover:bg-emerald-800 disabled:opacity-50";

/** Everything else with a box around it. */
export const SECONDARY_BUTTON =
  "min-h-11 rounded-lg border border-gray-200 bg-white px-3 font-semibold text-sm text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40";

/** An action with no box, for the quiet end of the page. */
export const TEXT_BUTTON =
  "text-sm text-gray-500 transition-colors hover:text-gray-800 hover:underline underline-offset-2";

/** A panel that explains something, quietly, inside another. */
export const NOTE = "rounded-lg bg-gray-50 p-2 text-xs text-gray-700";

/** Status pills: what went well, what did not, and what is merely so. */
export const TONE_PILL = {
  good: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  bad: "bg-red-50 text-red-800 ring-red-200",
  neutral: "bg-gray-100 text-gray-700 ring-gray-200",
} as const;

export const PILL =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold ring-1 ring-inset";

/** A small action that stays out of the way until it is wanted. */
export const QUIET_BUTTON =
  "inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 text-[13px] font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200 disabled:pointer-events-none disabled:text-gray-300";
