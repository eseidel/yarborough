import { describe, expect, it } from "vitest";
import {
  categoryPosterior,
  logGamma,
  normalCdf,
  regularizedIncompleteBeta,
  trendTest,
  trendWindow,
  wilsonInterval,
} from "../statistics";

const DAY = 24 * 60 * 60 * 1000;

describe("wilsonInterval", () => {
  it("widens for small samples and narrows for large ones", () => {
    const small = wilsonInterval(4, 5)!;
    expect(small.low).toBeCloseTo(0.376, 2);
    expect(small.high).toBeCloseTo(0.964, 2);
    const large = wilsonInterval(400, 500)!;
    expect(large.low).toBeCloseTo(0.762, 2);
    expect(large.high).toBeCloseTo(0.832, 2);
    expect(wilsonInterval(0, 0)).toBeNull();
    expect(wilsonInterval(0, 3)!.low).toBe(0);
    expect(wilsonInterval(3, 3)!.high).toBe(1);
  });
});

describe("special functions", () => {
  it("computes log gamma", () => {
    expect(logGamma(1)).toBeCloseTo(0, 10);
    expect(logGamma(5)).toBeCloseTo(Math.log(24), 10);
    expect(logGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 10);
  });

  it("computes the regularized incomplete beta function", () => {
    expect(regularizedIncompleteBeta(0.5, 2, 2)).toBeCloseTo(0.5, 10);
    expect(regularizedIncompleteBeta(0.2, 1, 1)).toBeCloseTo(0.2, 10);
    // I_x(1, b) = 1 - (1 - x)^b and I_x(a, 1) = x^a.
    expect(regularizedIncompleteBeta(0.5, 1, 3)).toBeCloseTo(0.875, 10);
    expect(regularizedIncompleteBeta(0.3, 2, 1)).toBeCloseTo(0.09, 10);
    // Symmetry.
    expect(regularizedIncompleteBeta(0.3, 4, 7)).toBeCloseTo(
      1 - regularizedIncompleteBeta(0.7, 7, 4),
      10,
    );
    expect(regularizedIncompleteBeta(0, 2, 3)).toBe(0);
    expect(regularizedIncompleteBeta(1, 2, 3)).toBe(1);
    expect(() => regularizedIncompleteBeta(0.5, 0, 1)).toThrow();
  });

  it("computes the normal CDF", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 4);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 4);
    expect(normalCdf(4)).toBeGreaterThan(0.9999);
  });
});

describe("categoryPosterior", () => {
  it("calls three misses in three a likely weak spot and shrinks small samples", () => {
    const missed = categoryPosterior(0, 3, 0.8);
    expect(missed.probabilityBelow).toBeGreaterThan(0.85);
    expect(missed.mean).toBeCloseTo(4 / 8, 10);

    const unremarkable = categoryPosterior(24, 30, 0.8);
    expect(unremarkable.probabilityBelow).toBeGreaterThan(0.4);
    expect(unremarkable.probabilityBelow).toBeLessThan(0.6);

    const strong = categoryPosterior(40, 40, 0.8);
    expect(strong.probabilityBelow).toBeLessThan(0.05);

    // No data: the prior sits on the reference, so it is a coin toss.
    expect(categoryPosterior(0, 0, 0.8).probabilityBelow).toBeCloseTo(0.5, 0);
  });

  it("keeps a degenerate reference inside the open interval", () => {
    expect(categoryPosterior(5, 5, 1).probabilityBelow).toBeLessThan(0.5);
    expect(categoryPosterior(0, 5, 0).probabilityBelow).toBeGreaterThan(0.5);
  });
});

describe("trendTest", () => {
  it("finds a rising accuracy and sizes it", () => {
    // 30 misses, then 30 hits: the clearest possible rise.
    const rising = [
      ...Array<boolean>(30).fill(false),
      ...Array<boolean>(30).fill(true),
    ];
    const trend = trendTest(rising)!;
    expect(trend.calls).toBe(60);
    expect(trend.pValue).toBeLessThan(0.001);
    expect(trend.label).toBe("improving");
    expect(trend.pointsPerHundredCalls).toBeGreaterThan(100);

    const falling = trendTest([...rising].reverse())!;
    expect(falling.label).toBe("slipping");
    expect(falling.pointsPerHundredCalls).toBeLessThan(-100);
  });

  it("sees no trend in a flat or alternating record", () => {
    const alternating = Array.from({ length: 40 }, (_, i) => i % 2 === 0);
    expect(trendTest(alternating)!.label).toBe("no clear trend");
    expect(trendTest([true, true, true])).toBeNull();
    expect(trendTest([false])).toBeNull();
  });

  it("gains power with more calls, so a heavy user need not double their history", () => {
    // A modest rise: 60% then 75%, in a fixed pattern.
    const block = (n: number, rate: number) =>
      Array.from({ length: n }, (_, i) => i % 20 < rate * 20);
    const short = trendTest([...block(20, 0.6), ...block(20, 0.75)])!;
    const long = trendTest([...block(200, 0.6), ...block(200, 0.75)])!;
    expect(long.pValue).toBeLessThan(short.pValue);
    expect(long.label).toBe("improving");
  });
});

describe("trendWindow", () => {
  const at = (daysAgo: number, now: number) => ({
    completedAt: now - daysAgo * DAY,
  });

  it("takes the last ninety days, extended back to forty calls", () => {
    const now = 1_800_000_000_000;
    const recent = Array.from({ length: 10 }, (_, i) => at(10 - i, now));
    const old = Array.from({ length: 50 }, (_, i) => at(400 - i, now));
    const window = trendWindow([...old, ...recent], now);
    expect(window).toHaveLength(40);
    expect(window[window.length - 1]).toBe(recent[9]);

    const busy = Array.from({ length: 300 }, (_, i) => at(120 - i * 0.4, now));
    const busyWindow = trendWindow(busy, now);
    expect(busyWindow.length).toBeGreaterThan(200);
    expect(busyWindow.every((o) => o.completedAt >= now - 90 * DAY)).toBe(true);

    expect(trendWindow([], now)).toEqual([]);
  });
});
