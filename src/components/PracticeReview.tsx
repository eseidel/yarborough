import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import type {
  CallHistory,
  Deal,
  Position,
  Vulnerability,
} from "../bridge/types";
import { getContract, getDeclarer } from "../bridge/auction";
import {
  contractHeadline,
  contractMakes,
  describePlay,
} from "../practice/analysis";
import type { CallVerdict } from "../practice/verdicts";
import { type Summary, formatAccuracy } from "../practice/stats";
import type { FeedbackTiming } from "../practice/usePracticeSession";
import { AboutFooter } from "./AboutFooter";
import { HandDiagram } from "./HandDiagram";
import { PlayAnalysis, type DoubleDummyAnalysis } from "./PlayAnalysis";
import { ReviewSummary } from "./ReviewSummary";
import { ShareButton } from "./ShareButton";
import { SuitText } from "./SuitText";
import {
  CARD,
  EYEBROW,
  LINK,
  PILL,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  TEXT_BUTTON,
  TONE_PILL,
} from "./ui";

/**
 * What the hand came to, as the card's headline: the contract, and whether
 * it makes. The result is the first thing a learner looks for, so it reads
 * with the contract rather than from the middle of a paragraph below.
 */
function ContractResult({
  history,
  analysis,
}: {
  history: CallHistory;
  analysis: DoubleDummyAnalysis | null;
}) {
  const contract = getContract(history);
  const declarer = getDeclarer(history);
  const tricks =
    contract && declarer && analysis
      ? analysis.table[contract.strain][declarer]
      : null;
  const play =
    contract && tricks !== null && describePlay(contract.level, tricks);
  return (
    <div className="space-y-1 text-center">
      <h2 className={EYEBROW}>Contract</h2>
      <p className="text-2xl font-bold text-gray-900" data-testid="contract">
        <SuitText text={contractHeadline(history)} />
      </p>
      {contract && tricks !== null && play && (
        <>
          <p data-testid="contract-result">
            <span
              className={`${PILL} ${
                contractMakes(contract.level, tricks)
                  ? TONE_PILL.good
                  : TONE_PILL.bad
              }`}
            >
              {play.charAt(0).toUpperCase() + play.slice(1)}
            </span>
          </p>
          <p className="mx-auto max-w-[30ch] text-xs text-gray-500">
            with all four hands in view and best play by both sides
          </p>
        </>
      )}
    </div>
  );
}

/** The learner's record, where it means most: under the hand just bid. */
function RecordLine({ summary }: { summary: Summary }) {
  return (
    <div
      className="flex items-baseline justify-between gap-2 border-t border-gray-100 pt-3 text-xs text-gray-500"
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
      <Link to="/progress" className={`${LINK} shrink-0 text-xs`}>
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
        className={`${CARD} scroll-mt-4 space-y-3 p-4`}
        data-testid="result-card"
      >
        <ContractResult
          history={history}
          analysis={doubleDummy?.analysis ?? null}
        />
        <div className="border-t border-gray-100 pt-3">
          <ReviewSummary
            history={history}
            verdicts={verdicts}
            userPosition={userPosition}
            saycAuction={saycAuction}
            vulnerability={vulnerability}
            onShowOptions={onShowOptions}
            onError={onError}
          />
        </div>
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
        className="sticky bottom-0 -mx-4 -mb-4 flex gap-2 border-t border-gray-200 bg-gray-50/90 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur"
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
          className={`${PRIMARY_BUTTON} flex-1`}
        >
          Next hand
        </button>
      </div>
    </>
  );
}
