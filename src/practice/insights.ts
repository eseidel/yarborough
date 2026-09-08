// What the Progress tab shows, computed from the record: the category tree
// with each node's accuracy, whether it is a weak spot or a strength, and
// its trend; the overall figures; and accuracy per block of hands for the
// chart. Pure functions over hands; see docs/progress-plan.md, section 3.

import type { HandRecord } from "./record/types";
import { POSITION_NAMES } from "../bridge/types";
import { type CallOutcome, callOutcomes, summarize } from "./stats";
import {
  type CategoryPosterior,
  type Interval,
  type Trend,
  categoryPosterior,
  trendTest,
  trendWindow,
  wilsonInterval,
} from "./statistics";

/** Posterior probability of sitting below the user's overall accuracy. */
export const WEAK_SPOT_PROBABILITY = 0.8;
export const STRENGTH_PROBABILITY = 0.2;
export const BLOCK_SIZE = 20;

export type NodeVerdict = "weak spot" | "strength" | null;

export interface NodeStats {
  /** The category path down to this node. */
  path: string[];
  name: string;
  level: 1 | 2 | 3;
  calls: number;
  matched: number;
  interval: Interval | null;
  /** Against the user's accuracy on every other call; null with no data. */
  posterior: CategoryPosterior | null;
  verdict: NodeVerdict;
  trend: Trend | null;
  children: NodeStats[];
}

export interface OverallStats {
  hands: number;
  handsOnSystem: number;
  calls: number;
  matched: number;
  interval: Interval | null;
  trend: Trend | null;
  streak: number;
  bestStreak: number;
}

export interface Block {
  /** 1-based position of the block's first and last hand. */
  firstHand: number;
  lastHand: number;
  calls: number;
  matched: number;
  interval: Interval | null;
}

export interface Insights {
  overall: OverallStats;
  /** Level-1 categories, in the engine's order of first appearance. */
  tree: NodeStats[];
  /** Level-2 weak spots, most certain first. */
  opportunities: NodeStats[];
  /** Level-2 strengths, most certain first. */
  strengths: NodeStats[];
  blocks: Block[];
}

interface Bucket {
  path: string[];
  outcomes: CallOutcome[];
  children: Map<string, Bucket>;
}

function bucketFor(root: Map<string, Bucket>, path: string[]): Bucket {
  let level = root;
  let bucket: Bucket | undefined;
  for (let i = 0; i < path.length; i++) {
    const name = path[i];
    bucket = level.get(name);
    if (!bucket) {
      bucket = {
        path: path.slice(0, i + 1),
        outcomes: [],
        children: new Map(),
      };
      level.set(name, bucket);
    }
    level = bucket.children;
  }
  return bucket!;
}

function verdictFor(posterior: CategoryPosterior | null): NodeVerdict {
  if (!posterior) return null;
  if (posterior.probabilityBelow >= WEAK_SPOT_PROBABILITY) return "weak spot";
  if (posterior.probabilityBelow <= STRENGTH_PROBABILITY) return "strength";
  return null;
}

function nodeStats(
  bucket: Bucket,
  total: { calls: number; matched: number },
  now: number,
): NodeStats {
  const calls = bucket.outcomes.length;
  const matched = bucket.outcomes.filter((o) => o.matched).length;
  const othersCalls = total.calls - calls;
  const reference =
    othersCalls > 0 ? (total.matched - matched) / othersCalls : null;
  const posterior =
    reference === null || calls === 0
      ? null
      : categoryPosterior(matched, calls, reference);
  const trend = trendTest(
    trendWindow(bucket.outcomes, now).map((o) => o.matched),
  );
  return {
    path: bucket.path,
    name: bucket.path[bucket.path.length - 1],
    level: bucket.path.length as 1 | 2 | 3,
    calls,
    matched,
    interval: wilsonInterval(matched, calls),
    posterior,
    verdict: verdictFor(posterior),
    trend,
    children: [...bucket.children.values()].map((child) =>
      nodeStats(child, total, now),
    ),
  };
}

function blocksFor(hands: HandRecord[], blockSize: number): Block[] {
  const blocks: Block[] = [];
  for (let start = 0; start < hands.length; start += blockSize) {
    const slice = hands.slice(start, start + blockSize);
    const outcomes = callOutcomes(slice);
    const matched = outcomes.filter((o) => o.matched).length;
    blocks.push({
      firstHand: start + 1,
      lastHand: start + slice.length,
      calls: outcomes.length,
      matched,
      interval: wilsonInterval(matched, outcomes.length),
    });
  }
  return blocks;
}

/** Everything the Progress tab shows. `hands` must be in chronological order. */
export function computeInsights(
  hands: HandRecord[],
  now: number = Date.now(),
  blockSize: number = BLOCK_SIZE,
): Insights {
  const summary = summarize(hands);
  const outcomes = callOutcomes(hands);
  const total = { calls: outcomes.length, matched: summary.matched };

  const root = new Map<string, Bucket>();
  for (const outcome of outcomes) {
    if (outcome.category.length === 0) continue;
    for (let depth = 1; depth <= outcome.category.length; depth++) {
      bucketFor(root, outcome.category.slice(0, depth)).outcomes.push(outcome);
    }
  }
  const tree = [...root.values()].map((bucket) =>
    nodeStats(bucket, total, now),
  );
  const levelTwo = tree.flatMap((node) => node.children);

  return {
    overall: {
      hands: summary.hands,
      handsOnSystem: summary.handsOnSystem,
      calls: total.calls,
      matched: total.matched,
      interval: wilsonInterval(total.matched, total.calls),
      trend: trendTest(trendWindow(outcomes, now).map((o) => o.matched)),
      streak: summary.streak,
      bestStreak: summary.bestStreak,
    },
    tree,
    opportunities: levelTwo
      .filter((node) => node.verdict === "weak spot")
      .sort(
        (a, b) => b.posterior!.probabilityBelow - a.posterior!.probabilityBelow,
      ),
    strengths: levelTwo
      .filter((node) => node.verdict === "strength")
      .sort(
        (a, b) => a.posterior!.probabilityBelow - b.posterior!.probabilityBelow,
      ),
    blocks: blocksFor(hands, blockSize),
  };
}

// The statistics above are for the app; the words below are for the user,
// who wants to know what is going well, what needs work, and whether they
// are improving. Numbers that need a statistics course (p-values,
// intervals, posterior probabilities) stay out of the text.

/** How sure the app is: "sure" past 95%, "likely" past 80%. */
export const SURE_PROBABILITY = 0.95;

/** "Weak spot" / "Likely weak spot" / "Strength" / "Likely strength" / null. */
export function describeVerdict(node: NodeStats): string | null {
  if (!node.verdict || !node.posterior) return null;
  const p =
    node.verdict === "weak spot"
      ? node.posterior.probabilityBelow
      : 1 - node.posterior.probabilityBelow;
  const noun = node.verdict === "weak spot" ? "weak spot" : "strength";
  return p >= SURE_PROBABILITY
    ? noun.charAt(0).toUpperCase() + noun.slice(1)
    : `Likely ${noun}`;
}

/**
 * "Improving, up about 6 points over your last 100 calls", "Probably
 * improving", "Holding steady", "Slipping, down about 4 points ...".
 */
export function describeTrend(trend: Trend | null): string {
  if (!trend || trend.label === "no clear trend") return "Holding steady";
  const label = trend.label.charAt(0).toUpperCase() + trend.label.slice(1);
  if (trend.label !== "improving" && trend.label !== "slipping") return label;
  const points = Math.round(Math.abs(trend.pointsPerHundredCalls));
  if (points < 1) return label;
  const direction = trend.label === "improving" ? "up" : "down";
  return `${label}, ${direction} about ${points} points over your last 100 calls`;
}

/** "80%" of calls on system, or "no calls yet". */
export function describeAccuracy(stats: {
  calls: number;
  matched: number;
}): string {
  if (stats.calls === 0) return "no calls yet";
  return `${Math.round((stats.matched / stats.calls) * 100)}%`;
}

/** "from 4 calls, so early days" / "from 120 calls". */
export function describeSample(calls: number): string {
  if (calls === 0) return "no calls yet";
  const noun = calls === 1 ? "call" : "calls";
  return calls < 10
    ? `from ${calls} ${noun}, so early days`
    : `from ${calls} ${noun}`;
}

const STRAIN_SYMBOL: Record<string, string> = {
  C: "♣",
  D: "♦",
  H: "♥",
  S: "♠",
  N: "NT",
};

/** "4♠ by North", "3NTX by East", or "Passed out". */
export function describeContract(hand: HandRecord): string {
  if (!hand.contract || !hand.declarer) return "Passed out";
  const level = hand.contract[0];
  const strain = STRAIN_SYMBOL[hand.contract[1]] ?? hand.contract[1];
  const doubled = hand.contract.slice(2);
  return `${level}${strain}${doubled} by ${POSITION_NAMES[hand.declarer]}`;
}
