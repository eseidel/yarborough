// cspell:ignore Lanczos betacf Abramowitz Stegun
// The statistics behind the Progress tab. See docs/progress-plan.md,
// section 3: every judgment about the record carries its own confidence,
// computed from however much data there is.
//
// Each checked call is one Bernoulli trial (matched or not).

/** A two-sided interval on a proportion. */
export interface Interval {
  low: number;
  high: number;
}

/** The 95% Wilson score interval for `matched` of `calls`. */
export function wilsonInterval(
  matched: number,
  calls: number,
  z: number = 1.96,
): Interval | null {
  if (calls <= 0) return null;
  const p = matched / calls;
  const z2 = z * z;
  const denominator = 1 + z2 / calls;
  const centre = (p + z2 / (2 * calls)) / denominator;
  const half =
    (z * Math.sqrt((p * (1 - p)) / calls + z2 / (4 * calls * calls))) /
    denominator;
  return {
    low: Math.max(0, centre - half),
    high: Math.min(1, centre + half),
  };
}

/** ln Γ(x) for x > 0 (Lanczos approximation, good to about 1e-15). */
export function logGamma(x: number): number {
  const coefficients = [
    76.18009172947146, -86.5053203294168, 24.01409824083091, -1.231739572450155,
    1.20865097386618e-3, -5.395239384953e-6,
  ];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let series = 1.000000000190015;
  for (const c of coefficients) {
    y += 1;
    series += c / y;
  }
  return -tmp + Math.log((Math.sqrt(2 * Math.PI) * series) / x);
}

/** Continued fraction for the incomplete beta function (Numerical Recipes betacf). */
function betaContinuedFraction(x: number, a: number, b: number): number {
  const MAX_ITERATIONS = 300;
  const EPSILON = 3e-14;
  const TINY = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_ITERATIONS; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPSILON) break;
  }
  return h;
}

/**
 * The regularized incomplete beta function I_x(a, b): the probability that a
 * Beta(a, b) variable is below x.
 */
export function regularizedIncompleteBeta(
  x: number,
  a: number,
  b: number,
): number {
  if (!(a > 0) || !(b > 0)) throw new Error("Beta parameters must be positive");
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    logGamma(a + b) -
      logGamma(a) -
      logGamma(b) +
      a * Math.log(x) +
      b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) {
    return (front * betaContinuedFraction(x, a, b)) / a;
  }
  return 1 - (front * betaContinuedFraction(1 - x, b, a)) / b;
}

/** The standard normal CDF Φ(x). */
export function normalCdf(x: number): number {
  // Abramowitz and Stegun 7.1.26 for erf, accurate to 1.5e-7.
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const poly =
    t *
    (0.254829592 +
      t *
        (-0.284496736 +
          t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(x * x) / 2);
  return 0.5 * (1 + (x < 0 ? -erf : erf));
}

/** How many calls of prior weight a category's posterior starts with. */
export const PRIOR_WEIGHT = 5;

export interface CategoryPosterior {
  /** The posterior mean accuracy. */
  mean: number;
  /** Probability the category's true accuracy is below `reference`. */
  probabilityBelow: number;
}

/**
 * A Beta posterior for one category's accuracy, with a prior centred on
 * `reference` (the user's accuracy everywhere else) carrying `priorWeight`
 * calls' worth of belief, updated by the category's own `matched` of
 * `calls`. Small samples are pulled toward "no evidence" rather than cut
 * off by a minimum count.
 */
export function categoryPosterior(
  matched: number,
  calls: number,
  reference: number,
  priorWeight: number = PRIOR_WEIGHT,
): CategoryPosterior {
  // A reference of exactly 0 or 1 makes the question degenerate; keep it
  // just inside the open interval.
  const r = Math.min(0.99, Math.max(0.01, reference));
  const a = priorWeight * r + matched;
  const b = priorWeight * (1 - r) + (calls - matched);
  return {
    mean: a / (a + b),
    probabilityBelow: regularizedIncompleteBeta(r, a, b),
  };
}

export type TrendLabel =
  | "improving"
  | "probably improving"
  | "no clear trend"
  | "probably slipping"
  | "slipping";

export interface Trend {
  /** Calls in the window. */
  calls: number;
  /** Fitted change in accuracy, in percentage points per hundred calls. */
  pointsPerHundredCalls: number;
  /** One-sided p-value for the slope having the sign it has. */
  pValue: number;
  label: TrendLabel;
}

/**
 * Is accuracy rising with time? The score test for a slope in a logistic
 * model of matched on call order (the Cochran–Armitage trend test with one
 * call per level), over `outcomes` in chronological order. Closed form, and
 * its power grows with the number of calls. Null when the outcomes cannot
 * carry a trend (fewer than two calls, or all the same).
 */
export function trendTest(outcomes: boolean[]): Trend | null {
  const n = outcomes.length;
  if (n < 2) return null;
  const matched = outcomes.filter(Boolean).length;
  if (matched === 0 || matched === n) return null;
  const pBar = matched / n;
  const xBar = (n - 1) / 2;
  let t = 0;
  let sxx = 0;
  outcomes.forEach((y, i) => {
    const dx = i - xBar;
    sxx += dx * dx;
    if (y) t += dx;
  });
  const z = t / Math.sqrt(pBar * (1 - pBar) * sxx);
  const slope = t / sxx; // per call, in probability
  const pointsPerHundredCalls = slope * 100 * 100;
  const pValue = z >= 0 ? 1 - normalCdf(z) : normalCdf(z);
  return {
    calls: n,
    pointsPerHundredCalls,
    pValue,
    label: trendLabel(z, pValue),
  };
}

function trendLabel(z: number, pValue: number): TrendLabel {
  if (pValue <= 0.05) return z > 0 ? "improving" : "slipping";
  if (pValue <= 0.2) return z > 0 ? "probably improving" : "probably slipping";
  return "no clear trend";
}

export const TREND_WINDOW_DAYS = 90;
export const TREND_MIN_CALLS = 40;

/**
 * The calls a trend is judged on: the last `days` days, extended back to at
 * least `minCalls` when they hold fewer. `completedAt` values must be in
 * chronological order.
 */
export function trendWindow<T extends { completedAt: number }>(
  outcomes: T[],
  now: number,
  days: number = TREND_WINDOW_DAYS,
  minCalls: number = TREND_MIN_CALLS,
): T[] {
  const since = now - days * 24 * 60 * 60 * 1000;
  let start = outcomes.findIndex((o) => o.completedAt >= since);
  if (start < 0) start = outcomes.length;
  start = Math.min(start, Math.max(0, outcomes.length - minCalls));
  return outcomes.slice(start);
}
