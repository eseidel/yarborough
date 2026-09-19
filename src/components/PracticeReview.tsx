import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import type {
  CallHistory,
  Deal,
  Position,
  Vulnerability,
} from "../bridge/types";
import type { CallVerdict } from "../practice/verdicts";
import { type Summary, formatAccuracy } from "../practice/stats";
import type { FeedbackTiming } from "../practice/usePracticeSession";
import { AboutFooter } from "./AboutFooter";
import { HandDiagram } from "./HandDiagram";
import { PlayAnalysis, type DoubleDummyAnalysis } from "./PlayAnalysis";
import { ReviewSummary } from "./ReviewSummary";
import { ShareButton } from "./ShareButton";

const PRIMARY_BUTTON =
  "flex-1 py-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-base transition-colors disabled:opacity-50";
const SECONDARY_BUTTON =
  "px-3 py-3 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 text-gray-800 font-semibold text-sm transition-colors";
const TEXT_BUTTON = "text-sm text-gray-500 hover:text-gray-800 hover:underline";

/** The learner's record, where it means most: under the hand just bid. */
function RecordLine({ summary }: { summary: Summary }) {
  return (
    <div
      className="flex items-baseline justify-between gap-2 border-t border-gray-100 pt-2 text-xs text-gray-500"
      data-testid="record-line"
    >
      <span>
        <span className="font-bold text-emerald-700 tabular-nums">
          {formatAccuracy(summary)}
        </span>{" "}
        on system
        <span className="tabular-nums">
          {" · "}
          {summary.hands} {summary.hands === 1 ? "hand" : "hands"}
          {summary.streak > 0 && ` · 🔥 ${summary.streak}`}
        </span>
      </span>
      <Link
        to="/progress"
        className="shrink-0 font-semibold text-emerald-700 hover:underline"
      >
        Progress
      </Link>
    </div>
  );
}

/**
 * Everything the page shows once the auction is over: one card holding the
 * result, the play and the learner's record, then all four hands, then the
 * actions.
 *
 * The actions stick to the bottom of the viewport. The review runs past the
 * bottom of a phone screen however tightly it is packed, and "Next hand" is
 * what most hands end with, so it is pinned rather than left at the end of
 * a scroll. Being the last child is what lets it stick: a sticky box cannot
 * leave its parent, so anything below it here would end up underneath it.
 */
export function PracticeReview({
  deal,
  boardNumber,
  dealer,
  history,
  verdicts,
  userPosition,
  saycAuction,
  vulnerability,
  doubleDummy,
  summary,
  feedbackTiming,
  thinking,
  shareUrl,
  onShowOptions,
  onError,
  onShowFeedbackEachCall,
  onNextHand,
  onRestart,
}: {
  deal: Deal;
  boardNumber: number;
  dealer: Position;
  history: CallHistory;
  verdicts: CallVerdict[];
  userPosition: Position;
  saycAuction: CallHistory | null;
  vulnerability: Vulnerability;
  /** The double-dummy result, or null while the solver is still running. */
  doubleDummy: {
    analysis: DoubleDummyAnalysis | null;
    error: string | null;
  } | null;
  summary: Summary;
  feedbackTiming: FeedbackTiming;
  /** The engine is dealing the next board. */
  thinking: boolean;
  shareUrl: string;
  onShowOptions: (history: CallHistory, index: number) => void;
  onError: (error: unknown) => void;
  onShowFeedbackEachCall: () => void;
  onNextHand: () => void;
  onRestart: () => void;
}) {
  const result = useRef<HTMLDivElement>(null);

  // The auction the user has been watching sits above the fold they are
  // looking at, so land them on the result instead of on the last pass.
  useEffect(() => {
    result.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <>
      <div
        ref={result}
        className="bg-white rounded-lg shadow p-3 space-y-3 scroll-mt-4"
        data-testid="result-card"
      >
        <ReviewSummary
          history={history}
          verdicts={verdicts}
          userPosition={userPosition}
          saycAuction={saycAuction}
          vulnerability={vulnerability}
          onShowOptions={onShowOptions}
          onError={onError}
        />
        <PlayAnalysis
          history={history}
          analysis={doubleDummy?.analysis ?? null}
          loading={doubleDummy === null}
          error={doubleDummy?.error ?? null}
          userSide="NS"
        />
        {summary.hands > 0 && <RecordLine summary={summary} />}
      </div>

      <HandDiagram
        deal={deal}
        userPosition={userPosition}
        table={doubleDummy?.analysis?.table ?? null}
        boardNumber={boardNumber}
        dealer={dealer}
        vulnerability={vulnerability}
      />

      {feedbackTiming === "end" && (
        <button
          type="button"
          onClick={onShowFeedbackEachCall}
          className={`${TEXT_BUTTON} text-center`}
        >
          Show feedback after each call instead
        </button>
      )}

      <AboutFooter />

      <div
        className="sticky bottom-0 -mx-4 -mb-4 flex gap-2 border-t border-gray-200 bg-gray-50/95 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm"
        data-testid="review-actions"
      >
        <button type="button" onClick={onRestart} className={SECONDARY_BUTTON}>
          Bid again
        </button>
        <ShareButton
          url={shareUrl}
          title="SAYC Bridge Practice Hand"
          text="Try bidding this bridge hand"
          className={SECONDARY_BUTTON}
        />
        <button
          type="button"
          onClick={onNextHand}
          disabled={thinking}
          className={PRIMARY_BUTTON}
        >
          Next hand
        </button>
      </div>
    </>
  );
}
