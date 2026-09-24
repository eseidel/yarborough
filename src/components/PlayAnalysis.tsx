import type { CallHistory, OpeningLead } from "../bridge/types";
import { POSITION_NAMES, SUITS, displayRank } from "../bridge/types";
import { getContract, getDeclarer } from "../bridge/auction";
import type { DoubleDummyTable } from "../dds/dds-core";
import {
  contractMakes,
  describePlay,
  formatContract,
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

function leadName(lead: OpeningLead): string {
  return `${SUITS[lead.card.suit].symbol}${displayRank(lead.card.rank)}`;
}

/**
 * What the standard opening lead does to the contract. The contract's own
 * result is the card's headline, above this, and what each side could have
 * made belongs to the cards, so the hand diagram carries it. Nothing shows
 * for a passed-out board, which has no lead.
 */
export function PlayAnalysis({
  history,
  analysis,
  loading = false,
  error = null,
}: {
  history: CallHistory;
  analysis: DoubleDummyAnalysis | null;
  loading?: boolean;
  error?: string | null;
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
  const tricks = contract && declarer ? table[contract.strain][declarer] : null;
  if (!contract || !lead || tricksAfterLead === null) return null;

  // The result above is double dummy: the defense finds the best lead. This
  // line fixes the lead a real defender would make and plays on from there.
  const standardLead = (
    <>
      If {POSITION_NAMES[lead.leader]} makes the standard lead, the{" "}
      <SuitText text={leadName(lead)} />
      {lead.reason && <span className="text-gray-500"> ({lead.reason})</span>},
      and both sides play perfectly after that,
    </>
  );
  return (
    <section className={`${SECTION} animate-fade text-gray-700`}>
      <h2 className={EYEBROW}>The opening lead</h2>
      <p data-testid="double-dummy-after-lead">
        {tricksAfterLead === tricks ? (
          <>{standardLead} the result is the same.</>
        ) : (
          <>
            The result above assumes the defense finds the best opening lead.{" "}
            {standardLead}{" "}
            <SuitText
              text={formatContract(
                contract.level,
                contract.strain,
                contract.doubled,
              )}
            />{" "}
            <span
              className={
                contractMakes(contract.level, tricksAfterLead)
                  ? "font-semibold text-emerald-700"
                  : "font-semibold text-red-700"
              }
            >
              {describePlay(contract.level, tricksAfterLead)}
            </span>
            .
          </>
        )}
      </p>
    </section>
  );
}
