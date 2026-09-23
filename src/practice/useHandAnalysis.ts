import { useEffect, useState } from "react";
import type { CallHistory, Hand, HandAnalysis } from "../bridge/types";
import { callToString, handToCdhsString } from "../bridge/types";
import { getHandAnalysis } from "../bridge/engine";

/**
 * A point of an auction to weigh the user's own hand at: the calls before
 * `index`, and the hand of the seat that makes (or made) call `index`.
 *
 * Only ever the user's hand. Practice deals all four hands, but a learner at
 * this table sees one of them, so an explanation of another seat's call is
 * the rule it follows and never the cards behind it.
 */
export interface HandAnalysisRequest {
  hand: Hand;
  history: CallHistory;
  index: number;
  vulnerability: string;
}

function requestKey(request: HandAnalysisRequest): string {
  const calls = request.history.calls
    .slice(0, request.index)
    .map(callToString)
    .join(",");
  return `${handToCdhsString(request.hand)}|${calls}|${request.history.dealer}|${request.vulnerability}`;
}

/**
 * Analyses already asked for, by request. The same point is weighed by the
 * feedback on a call, by the call's explanation in the auction, and again by
 * the review, and the engine's worker takes one request at a time, so each
 * is asked for once. Old entries go first once the cache is full.
 */
const cache = new Map<string, Promise<HandAnalysis | null>>();
const CACHE_SIZE = 48;

function analysisFor(
  request: HandAnalysisRequest,
): Promise<HandAnalysis | null> {
  const key = requestKey(request);
  let pending = cache.get(key);
  if (!pending) {
    const calls = key.split("|")[1];
    // A failure leaves the explanation as it was without the hand; it is
    // never an error the learner has to dismiss.
    pending = Promise.resolve()
      .then(() =>
        getHandAnalysis(
          request.hand,
          calls,
          request.history.dealer,
          request.vulnerability,
        ),
      )
      .catch(() => null);
    cache.set(key, pending);
    if (cache.size > CACHE_SIZE) {
      cache.delete(cache.keys().next().value!);
    }
  }
  return pending;
}

/** Forget every analysis, so that a test's engine answers afresh. */
export function clearHandAnalysisCache(): void {
  cache.clear();
}

/**
 * The engine's analysis of the user's hand at a point of the auction:
 * undefined while it is being worked out, null when there is none (no
 * request, or the engine could not answer).
 */
export function useHandAnalysis(
  request: HandAnalysisRequest | null,
): HandAnalysis | null | undefined {
  const key = request ? requestKey(request) : null;
  const [loaded, setLoaded] = useState<{
    key: string;
    analysis: HandAnalysis | null;
  } | null>(null);

  // The request is rebuilt on every render; its key is what identifies it.
  useEffect(() => {
    if (!key || !request) return;
    let cancelled = false;
    void analysisFor(request).then((analysis) => {
      if (!cancelled) setLoaded({ key, analysis });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!key) return null;
  return loaded?.key === key ? loaded.analysis : undefined;
}
