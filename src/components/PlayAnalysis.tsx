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
import { EYEBROW } from "./ui";

export interface DoubleDummyAnalysis {
  table: DoubleDummyTable;
  lead: OpeningLead | null;
  tricksAfterLead: number | null;
}

/** The rule and spacing that join this to the summary above, in one card. */
const SECTION = "space-y-2 border-t border-gray-100 pt-3 text-sm";

const TONE_CLASSES = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-900",
  mixed: "border-amber-200 bg-amber-50 text-amber-900",
  bad: "border-red-200 bg-red-50 text-red-900",
};

function leadName(lead: OpeningLead): string {
  return `${SUITS[lead.card.suit].symbol}${displayRank(lead.card.rank)}`;
}

/**
 * How the auction turned out, one job per line: what the textbook lead does
 * to the contract, and a judgment of the bidding. The contract's own result
 * is the card's headline, above this, and what each side could have made
 * belongs to the cards rather than to the auction, so the hand diagram
 * carries it. The trick table itself is never shown; these sentences are
 * what a learner needs from it.
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
        className={`${SECTION} animate-pulse text-gray-400`}
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
    <section className={`${SECTION} text-gray-700`}>
      <h2 className={EYEBROW}>How the cards play</h2>
      {contract && lead && tricksAfterLead !== null && (
        <p data-testid="double-dummy-after-lead">
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
                    ? "font-semibold text-emerald-700"
                    : "font-semibold text-red-700"
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
        className={`rounded-lg border px-3 py-2 ${TONE_CLASSES[verdict.tone]}`}
        data-testid="play-verdict"
      >
        <SuitText text={verdict.text} />
      </p>
    </section>
  );
}
