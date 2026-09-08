// Adaptive practice: which weak spots to aim at, and the search for a board
// whose auction asks the user for a call in one of them. See
// docs/progress-plan.md, section 4.

import type { AdaptiveBoard } from "../bridge/types";
import type { Insights, NodeStats } from "./insights";

/** Boards the engine tries per request, so one request never holds the worker long. */
export const ATTEMPTS_PER_REQUEST = 3;
/** Requests before the search gives up and a random board is dealt instead. */
export const MAX_REQUESTS = 10;

export interface AdaptiveTarget {
  /** A level-2 category path. */
  path: string[];
  /** How much to practice it, relative to the other targets. */
  weight: number;
}

/**
 * The user's weak spots as targets, each weighted by how sure the app is
 * that it is a weak spot times how far below their overall accuracy it
 * sits, so a near-certain small weakness and a likely large one both get
 * practice and neither dominates.
 */
export function adaptiveTargets(insights: Insights): AdaptiveTarget[] {
  const { overall } = insights;
  const overallAccuracy =
    overall.calls === 0 ? 0 : overall.matched / overall.calls;
  return insights.opportunities.map((node: NodeStats) => {
    const posterior = node.posterior!;
    const gap = Math.max(0.05, overallAccuracy - posterior.mean);
    return { path: node.path, weight: posterior.probabilityBelow * gap };
  });
}

/** One target, drawn in proportion to the weights. */
export function chooseTarget(
  targets: AdaptiveTarget[],
  random: () => number = Math.random,
): AdaptiveTarget | null {
  const total = targets.reduce((sum, t) => sum + t.weight, 0);
  if (targets.length === 0 || total <= 0) return targets[0] ?? null;
  let draw = random() * total;
  for (const target of targets) {
    draw -= target.weight;
    if (draw < 0) return target;
  }
  return targets[targets.length - 1];
}

/** "To 1NT", "To 1NT and Takeout doubles", "To 1NT, Raises and 2 more". */
export function describeTargets(paths: string[][]): string {
  const names = paths.map((path) => path[path.length - 1]);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

export interface AdaptiveSearchOptions {
  generate: (
    targets: string[][],
    maxAttempts: number,
  ) => Promise<AdaptiveBoard | null>;
  random?: () => number;
  maxRequests?: number;
  attemptsPerRequest?: number;
  /** Set to stop between requests; the result is then null. */
  cancelled?: { current: boolean };
}

export interface AdaptiveSearchResult {
  board: AdaptiveBoard;
  /** The target the request that found it was aiming at. */
  target: AdaptiveTarget;
}

/**
 * Look for a board that practices one of `targets`: each request aims at
 * one target drawn by weight and tries a few boards for it; the worker's
 * queue drains between requests, so the robots never wait long. Null when
 * the requests ran out or the search was cancelled.
 */
export async function searchAdaptiveBoard(
  targets: AdaptiveTarget[],
  options: AdaptiveSearchOptions,
): Promise<AdaptiveSearchResult | null> {
  const {
    generate,
    random = Math.random,
    maxRequests = MAX_REQUESTS,
    attemptsPerRequest = ATTEMPTS_PER_REQUEST,
    cancelled,
  } = options;
  for (let request = 0; request < maxRequests; request++) {
    if (cancelled?.current) return null;
    const target = chooseTarget(targets, random);
    if (!target) return null;
    const board = await generate([target.path], attemptsPerRequest);
    if (cancelled?.current) return null;
    if (board) return { board, target };
  }
  return null;
}
