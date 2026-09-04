import { useState } from "react";
import type { CallHistory, Position, Vulnerability } from "../bridge/types";
import { callLabel } from "../bridge/types";
import { getContract, getDeclarer, isPassOut } from "../bridge/auction";
import { formatContractBy } from "../practice/analysis";
import {
  type CallVerdict,
  callIndicesFor,
  describeAuctionPoint,
  summarizeVerdicts,
} from "../practice/verdicts";
import { useCallExplanation } from "../hooks/useCallExplanation";
import { CallTable } from "./CallTable";
import { ConstraintsDisplay } from "./ConstraintsDisplay";
import { SuitText } from "./SuitText";

function contractHeadline(history: CallHistory): string {
  if (isPassOut(history)) return "Passed out";
  const contract = getContract(history);
  const declarer = getDeclarer(history);
  return contract && declarer ? formatContractBy(contract, declarer) : "";
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function MissedCall({
  history,
  verdict,
  onShowOptions,
}: {
  history: CallHistory;
  verdict: CallVerdict;
  onShowOptions?: (index: number) => void;
}) {
  const [why, setWhy] = useState(false);
  const { sayc } = verdict;
  const canExplain = Boolean(sayc.constraints || sayc.description);
  return (
    <li className="py-2 first:pt-0 last:pb-0" data-testid="missed-call">
      <div>
        <span className="text-red-600 font-bold mr-1">✗</span>
        <SuitText
          text={capitalize(describeAuctionPoint(history, verdict.index))}
        />
        , you bid{" "}
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
      <div className="flex gap-3 mt-0.5 text-xs">
        {canExplain && (
          <button
            type="button"
            onClick={() => setWhy((prev) => !prev)}
            className="text-blue-600 hover:underline"
            aria-expanded={why}
          >
            {why ? "Hide why" : "Why?"}
          </button>
        )}
        {onShowOptions && (
          <button
            type="button"
            onClick={() => onShowOptions(verdict.index)}
            className="text-blue-600 hover:underline"
          >
            All options here
          </button>
        )}
      </div>
      {why && (
        <div className="mt-1 text-xs bg-blue-50 rounded p-2 text-blue-900 space-y-0.5">
          {sayc.constraints && (
            <div>
              <ConstraintsDisplay constraints={sayc.constraints} />
            </div>
          )}
          {sayc.description && (
            <div className="text-blue-700">{sayc.description}</div>
          )}
        </div>
      )}
    </li>
  );
}

function SaycAuction({
  auction,
  vulnerability,
  onShowOptions,
  onError,
}: {
  auction: CallHistory;
  vulnerability: Vulnerability;
  onShowOptions?: (history: CallHistory, index: number) => void;
  onError?: (error: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const explanation = useCallExplanation(auction, vulnerability, onError);
  return (
    <div className="pt-2 border-t border-gray-100" data-testid="sayc-auction">
      <div className="text-gray-700">
        Bidding on system throughout, SAYC reaches{" "}
        <span className="font-semibold">
          <SuitText text={contractHeadline(auction)} />
        </span>
        .{" "}
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="text-blue-600 hover:underline text-xs"
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
 * The result card at the top of the review: the contract, then how the
 * user's calls compared with SAYC, call by call.
 */
export function ReviewSummary({
  history,
  verdicts,
  userPosition,
  saycAuction,
  vulnerability,
  onShowOptions,
  onError,
}: {
  history: CallHistory;
  verdicts: CallVerdict[];
  userPosition: Position;
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
    <div
      className="bg-white rounded-lg shadow p-3 space-y-2 text-sm"
      data-testid="review-summary"
    >
      <div className="text-center">
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          Contract
        </div>
        <div
          className="text-2xl font-bold text-gray-900"
          data-testid="contract"
        >
          <SuitText text={contractHeadline(history)} />
        </div>
      </div>
      {pending ? (
        <p
          className="text-center text-gray-400 animate-pulse"
          data-testid="verdict-pending"
        >
          Checking your calls against SAYC…
        </p>
      ) : summary.missed.length === 0 ? (
        <p
          className="text-center font-semibold text-emerald-700"
          data-testid="verdict-on-system"
        >
          ✓{" "}
          {summary.total === 1
            ? "Your call followed SAYC"
            : `All ${summary.total} of your calls followed SAYC`}
          {summary.assisted > 0 &&
            ` (${summary.assisted} after seeing the SAYC bid)`}
        </p>
      ) : (
        <>
          <p
            className="text-center font-semibold text-red-700"
            data-testid="verdict-missed"
          >
            {summary.missed.length} of your {summary.total}{" "}
            {plural(summary.total)} differed from SAYC
          </p>
          <ul className="divide-y divide-gray-100">
            {summary.missed.map((verdict) => (
              <MissedCall
                key={verdict.index}
                history={history}
                verdict={verdict}
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
          onShowOptions={onShowOptions}
          onError={onError}
        />
      )}
    </div>
  );
}
