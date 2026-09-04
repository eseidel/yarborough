import type { CallHistory, OpeningLead } from "../bridge/types";
import { POSITION_NAMES, SUITS, displayRank } from "../bridge/types";
import { getContract, getDeclarer } from "../bridge/auction";
import type { DoubleDummyTable } from "../dds/dds-core";
import {
  type Side,
  biddingVerdict,
  contractMakes,
  describeMakeable,
  describePlay,
  formatContractBy,
  makeableContracts,
  otherSide,
} from "../practice/analysis";
import { SuitText } from "./SuitText";

export interface DoubleDummyAnalysis {
  table: DoubleDummyTable;
  lead: OpeningLead | null;
  tricksAfterLead: number | null;
}

const TONE_CLASSES = {
  good: "bg-emerald-50 border-emerald-200 text-emerald-900",
  mixed: "bg-amber-50 border-amber-200 text-amber-900",
  bad: "bg-red-50 border-red-200 text-red-900",
};

function leadName(lead: OpeningLead): string {
  return `${SUITS[lead.card.suit].symbol}${displayRank(lead.card.rank)}`;
}

/**
 * How the cards play, in sentences: the contract's double-dummy result, what
 * the textbook lead does to it, what each side could make, and how the
 * bidding compares with that. The trick table itself is not shown; these
 * sentences are what a learner needs from it.
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
        className="bg-white rounded-lg shadow p-3 text-sm text-gray-500"
        data-testid="double-dummy-error"
      >
        The play could not be analyzed: {error}
      </div>
    );
  }
  if (loading || !analysis) {
    return (
      <div
        className="bg-white rounded-lg shadow p-3 text-sm text-gray-400 animate-pulse"
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
    <div className="bg-white rounded-lg shadow p-3 space-y-2 text-sm text-gray-800">
      <h2 className="font-bold text-xs text-gray-500 uppercase tracking-wider">
        How the cards play
      </h2>
      {contract && declarer && tricks !== null && (
        <p data-testid="double-dummy-contract">
          <span className="font-semibold">
            <SuitText text={formatContractBy(contract, declarer)} />
          </span>{" "}
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
          {POSITION_NAMES[lead.leader]}&rsquo;s normal lead is the{" "}
          <SuitText text={leadName(lead)} />
          {lead.reason && (
            <span className="text-gray-500"> ({lead.reason})</span>
          )}
          {tricksAfterLead === tricks ? (
            <>, which does not change that.</>
          ) : (
            <>
              . After it the contract{" "}
              <span
                className={
                  contractMakes(contract.level, tricksAfterLead)
                    ? "text-emerald-700 font-semibold"
                    : "text-red-700 font-semibold"
                }
              >
                {describePlay(contract.level, tricksAfterLead)}
              </span>
              , because the defense no longer sees declarer&rsquo;s cards before
              the first trick.
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
      <p className="text-gray-700" data-testid="makeable-contracts">
        <SuitText
          text={describeMakeable(userSide, makeableContracts(table, userSide))}
        />
        .{" "}
        <SuitText
          text={describeMakeable(
            otherSide(userSide),
            makeableContracts(table, otherSide(userSide)),
          )}
        />
        .
      </p>
    </div>
  );
}
