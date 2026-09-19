import type { CallHistory, OpeningLead } from "../bridge/types";
import { POSITION_NAMES, SUITS, displayRank } from "../bridge/types";
import { getContract, getDeclarer } from "../bridge/auction";
import type { DoubleDummyTable } from "../dds/dds-core";
import {
  type Side,
  biddingVerdict,
  contractMakes,
  describePlay,
} from "../practice/analysis";
import { SuitText } from "./SuitText";

export interface DoubleDummyAnalysis {
  table: DoubleDummyTable;
  lead: OpeningLead | null;
  tricksAfterLead: number | null;
}

/** The rule and spacing that join this to the summary above, in one card. */
const SECTION = "border-t border-gray-100 pt-3 text-sm";

const TONE_CLASSES = {
  good: "bg-emerald-50 border-emerald-200 text-emerald-900",
  mixed: "bg-amber-50 border-amber-200 text-amber-900",
  bad: "bg-red-50 border-red-200 text-red-900",
};

function leadName(lead: OpeningLead): string {
  return `${SUITS[lead.card.suit].symbol}${displayRank(lead.card.rank)}`;
}

/**
 * How the auction turned out, one job per line: the contract's
 * double-dummy result, what the textbook lead does to it, and a judgment of
 * the bidding. What each side could have made belongs to the cards rather
 * than to the auction, so the hand diagram carries it, beside that side's
 * points and fits. The trick table itself is never shown; these sentences
 * are what a learner needs from it.
 * It is the lower half of the review's result card, under the contract the
 * summary names, so its lines say "it" rather than naming the contract
 * again, and it draws a dividing rule instead of a card of its own.
 */
export function PlayAnalysis({
  history,
  analysis,
  loading = false,
  error = null,
  userSide = "NS",
}: {
  history: CallHistory;
  analysis: DoubleDummyAnalysis | null;
  loading?: boolean;
  error?: string | null;
  userSide?: Side;
}) {
  const contract = getContract(history);
  const declarer = getDeclarer(history);

  if (error) {
    return (
      <div
        className={`${SECTION} text-gray-500`}
        data-testid="double-dummy-error"
      >
        The play could not be analyzed: {error}
      </div>
    );
  }
  if (loading || !analysis) {
    return (
      <div
        className={`${SECTION} text-gray-400 animate-pulse`}
        data-testid="double-dummy-loading"
      >
        Working out how the cards play…
      </div>
    );
  }

  const { table, lead, tricksAfterLead } = analysis;
  const verdict = biddingVerdict(contract, declarer, table, userSide);
  const tricks = contract && declarer ? table[contract.strain][declarer] : null;

  return (
    <div className={`${SECTION} space-y-2 text-gray-800`}>
      <h2 className="font-bold text-xs text-gray-500 uppercase tracking-wider">
        How the cards play
      </h2>
      {contract && declarer && tricks !== null && (
        <p data-testid="double-dummy-contract">
          It{" "}
          <span
            className={
              contractMakes(contract.level, tricks)
                ? "text-emerald-700 font-semibold"
                : "text-red-700 font-semibold"
            }
          >
            {describePlay(contract.level, tricks)}
          </span>{" "}
          with all four hands in view and best play by both sides.
        </p>
      )}
      {contract && lead && tricksAfterLead !== null && (
        <p data-testid="double-dummy-after-lead" className="text-gray-700">
          {tricksAfterLead === tricks ? (
            <>
              {POSITION_NAMES[lead.leader]}&rsquo;s normal lead, the{" "}
              <SuitText text={leadName(lead)} />
              {lead.reason && (
                <span className="text-gray-500"> ({lead.reason})</span>
              )}
              , does not change that.
            </>
          ) : (
            <>
              After {POSITION_NAMES[lead.leader]}&rsquo;s normal lead, the{" "}
              <SuitText text={leadName(lead)} />
              {lead.reason && (
                <span className="text-gray-500"> ({lead.reason})</span>
              )}
              , it{" "}
              <span
                className={
                  contractMakes(contract.level, tricksAfterLead)
                    ? "text-emerald-700 font-semibold"
                    : "text-red-700 font-semibold"
                }
              >
                {describePlay(contract.level, tricksAfterLead)}
              </span>
              : the defense no longer sees declarer&rsquo;s cards before the
              first trick.
            </>
          )}
        </p>
      )}
      <p
        className={`rounded border px-2.5 py-2 ${TONE_CLASSES[verdict.tone]}`}
        data-testid="play-verdict"
      >
        <SuitText text={verdict.text} />
      </p>
    </div>
  );
}
