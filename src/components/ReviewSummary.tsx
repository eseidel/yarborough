import { useState } from "react";
import type {
  CallHistory,
  Hand,
  Position,
  Vulnerability,
} from "../bridge/types";
import { callLabel } from "../bridge/types";
import { contractHeadline } from "../practice/analysis";
import { missReasons } from "../practice/hand-reasons";
import { useHandAnalysis } from "../practice/useHandAnalysis";
import {
  type CallVerdict,
  callIndicesFor,
  summarizeVerdicts,
} from "../practice/verdicts";
import { type YourHand, useCallExplanation } from "../hooks/useCallExplanation";
import { CallTable } from "./CallTable";
import { ConstraintsDisplay } from "./ConstraintsDisplay";
import { HandReasons } from "./HandReasons";
import { SuitText } from "./SuitText";
import { EYEBROW, LINK_SMALL, NOTE, PILL, TONE_PILL } from "./ui";

function MissedCall({
  verdict,
  history,
  vulnerability,
  hand,
  onShowOptions,
}: {
  verdict: CallVerdict;
  history: CallHistory;
  vulnerability: Vulnerability;
  hand?: Hand;
  onShowOptions?: (index: number) => void;
}) {
  const [why, setWhy] = useState(false);
  const { sayc } = verdict;
  const analysis = useHandAnalysis(
    hand ? { hand, history, index: verdict.index, vulnerability } : null,
  );
  const canExplain = Boolean(sayc.constraints || sayc.description);
  return (
    <li className="py-2 first:pt-0 last:pb-0" data-testid="missed-call">
      <div>
        <span className="mr-1 font-bold text-red-600">✗</span>
        You bid{" "}
        <span className="font-semibold">
          <SuitText text={callLabel(verdict.call)} />
        </span>
        . SAYC bids{" "}
        <span className="font-semibold">
          <SuitText text={callLabel(sayc.call)} />
        </span>
        {sayc.ruleName ? (
          <>
            : <span className="text-gray-700">{sayc.ruleName}</span>.
          </>
        ) : (
          "."
        )}
        {verdict.assisted && (
          <span className="text-gray-500"> (SAYC bid shown first)</span>
        )}
      </div>
      {hand && analysis !== undefined && (
        <HandReasons
          lines={missReasons(hand, verdict.call, sayc.call, analysis)}
          className="mt-0.5 text-gray-700"
        />
      )}
      <div className="mt-1 flex gap-3">
        {canExplain && (
          <button
            type="button"
            onClick={() => setWhy((prev) => !prev)}
            className={LINK_SMALL}
            aria-expanded={why}
          >
            {why ? "Hide why" : "Why?"}
          </button>
        )}
        {onShowOptions && (
          <button
            type="button"
            onClick={() => onShowOptions(verdict.index)}
            className={LINK_SMALL}
          >
            All options here
          </button>
        )}
      </div>
      {why && (
        <div className={`${NOTE} mt-1 space-y-0.5`}>
          {sayc.constraints && (
            <div>
              <ConstraintsDisplay constraints={sayc.constraints} />
            </div>
          )}
          {sayc.description && (
            <div className="text-gray-500">{sayc.description}</div>
          )}
        </div>
      )}
    </li>
  );
}

function SaycAuction({
  auction,
  vulnerability,
  yourHand,
  onShowOptions,
  onError,
}: {
  auction: CallHistory;
  vulnerability: Vulnerability;
  yourHand?: YourHand;
  onShowOptions?: (history: CallHistory, index: number) => void;
  onError?: (error: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const explanation = useCallExplanation(
    auction,
    vulnerability,
    onError,
    yourHand,
  );
  return (
    <div data-testid="sayc-auction">
      <div className="text-gray-700">
        Bidding on system throughout, SAYC reaches{" "}
        <span className="font-semibold">
          <SuitText text={contractHeadline(auction)} />
        </span>
        .{" "}
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className={LINK_SMALL}
          data-testid="sayc-auction-toggle"
          aria-expanded={open}
        >
          {open ? "Hide that auction" : "Show that auction"}
        </button>
      </div>
      {open && (
        <div className="mt-2" data-testid="sayc-auction-table">
          <CallTable
            callHistory={auction}
            vulnerability={vulnerability}
            onCallClick={explanation.handleCallClick}
            selectedCallIndex={explanation.selectedCallIndex}
            callExplanation={explanation.callExplanation}
            explanationLoading={explanation.explanationLoading}
            handReasons={explanation.handReasons}
            onShowOptions={
              onShowOptions
                ? (index) => onShowOptions(auction, index)
                : undefined
            }
          />
          <p className="text-xs text-gray-500 mt-1">
            Tap a call to see what it means.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * How the user's calls compared with SAYC, call by call. It is a section of
 * the review's result card, under the contract that card leads with, so it
 * draws no card of its own.
 */
export function ReviewSummary({
  history,
  verdicts,
  userPosition,
  hand,
  saycAuction,
  vulnerability,
  onShowOptions,
  onError,
}: {
  history: CallHistory;
  verdicts: CallVerdict[];
  userPosition: Position;
  /** The user's hand: each miss is explained against it. */
  hand?: Hand;
  /** The engine's own auction for the board; null while it is being bid. */
  saycAuction: CallHistory | null;
  vulnerability: Vulnerability;
  /** Open every legal call at a point of `history` (or of the SAYC auction). */
  onShowOptions?: (history: CallHistory, index: number) => void;
  onError?: (error: unknown) => void;
}) {
  const userCalls = callIndicesFor(history, userPosition).length;
  const pending = verdicts.length < userCalls;
  const summary = summarizeVerdicts(verdicts);
  const plural = (n: number) => (n === 1 ? "call" : "calls");

  return (
    <section className="space-y-2 text-sm" data-testid="review-summary">
      <h2 className={EYEBROW}>Your bidding</h2>
      {pending ? (
        <p
          className="animate-pulse text-gray-400"
          data-testid="verdict-pending"
        >
          Checking your calls against SAYC…
        </p>
      ) : summary.missed.length === 0 ? (
        <p data-testid="verdict-on-system">
          <span className={`${PILL} ${TONE_PILL.good}`}>
            ✓{" "}
            {summary.total === 1
              ? "Your call followed SAYC"
              : `All ${summary.total} of your calls followed SAYC`}
          </span>
          {summary.assisted > 0 && (
            <span className="ml-2 text-xs text-gray-500">
              {summary.assisted} after seeing the SAYC bid
            </span>
          )}
        </p>
      ) : (
        <>
          <p data-testid="verdict-missed">
            <span className={`${PILL} ${TONE_PILL.bad}`}>
              {summary.missed.length} of your {summary.total}{" "}
              {plural(summary.total)} differed from SAYC
            </span>
          </p>
          <ul className="divide-y divide-gray-100">
            {summary.missed.map((verdict) => (
              <MissedCall
                key={verdict.index}
                verdict={verdict}
                history={history}
                vulnerability={vulnerability}
                hand={hand}
                onShowOptions={
                  onShowOptions
                    ? (index) => onShowOptions(history, index)
                    : undefined
                }
              />
            ))}
          </ul>
        </>
      )}
      {!pending && summary.missed.length > 0 && saycAuction && (
        <SaycAuction
          auction={saycAuction}
          vulnerability={vulnerability}
          yourHand={hand ? { seat: userPosition, hand } : undefined}
          onShowOptions={onShowOptions}
          onError={onError}
        />
      )}
    </section>
  );
}
