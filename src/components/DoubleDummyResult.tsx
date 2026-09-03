import type { ReactNode } from "react";
import type {
  CallHistory,
  OpeningLead,
  Position,
  StrainName,
} from "../bridge/types";
import {
  POSITION_NAMES,
  SUITS,
  displayRank,
  strainColor,
  strainSymbol,
} from "../bridge/types";
import { getContract, getDeclarer } from "../bridge/auction";
import { type DoubleDummyTable, describeResult } from "../dds/dds-core";

export interface DoubleDummyAnalysis {
  table: DoubleDummyTable;
  lead: OpeningLead | null;
  tricksAfterLead: number | null;
}

const TABLE_STRAINS: StrainName[] = ["N", "S", "H", "D", "C"];
const TABLE_POSITIONS: Position[] = ["N", "E", "S", "W"];

function cardLabel(lead: OpeningLead): ReactNode {
  return (
    <span className="font-semibold">
      <span className={SUITS[lead.card.suit].color}>
        {SUITS[lead.card.suit].symbol}
      </span>
      {displayRank(lead.card.rank)}
    </span>
  );
}

function resultLabel(level: number, tricks: number): ReactNode {
  return (
    <span
      className={`font-semibold ${
        tricks >= level + 6 ? "text-emerald-700" : "text-red-700"
      }`}
    >
      {describeResult(level, tricks)}
    </span>
  );
}

export function DoubleDummyResult({
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
        className="text-center text-sm text-gray-500"
        data-testid="double-dummy-error"
      >
        Double dummy unavailable: {error}
      </div>
    );
  }
  if (loading || !analysis) {
    return (
      <div
        className="text-center text-sm text-gray-400"
        data-testid="double-dummy-loading"
      >
        Solving double dummy...
      </div>
    );
  }

  const { table, lead, tricksAfterLead } = analysis;

  return (
    <div className="space-y-2" data-testid="double-dummy-result">
      <div className="text-center text-sm font-semibold text-gray-600">
        Double Dummy
      </div>
      {contract && declarer && (
        <div className="text-center text-sm text-gray-700 space-y-0.5">
          <div className="font-semibold">
            {contract.level}
            <span className={strainColor(contract.strain)}>
              {strainSymbol(contract.strain)}
            </span>
            {contract.doubled ?? ""} by {POSITION_NAMES[declarer]}
          </div>
          <div>
            Best defense:{" "}
            <span data-testid="double-dummy-contract">
              {resultLabel(contract.level, table[contract.strain][declarer])}
            </span>
          </div>
          {lead && tricksAfterLead !== null && (
            <div data-testid="double-dummy-after-lead">
              After {POSITION_NAMES[lead.leader]} leads {cardLabel(lead)}:{" "}
              {resultLabel(contract.level, tricksAfterLead)}
              <div className="text-xs text-gray-400">{lead.reason}</div>
            </div>
          )}
        </div>
      )}
      <table
        className="mx-auto text-sm border-collapse"
        data-testid="double-dummy-table"
      >
        <thead>
          <tr>
            <th className="w-10" />
            {TABLE_POSITIONS.map((position) => (
              <th
                key={position}
                className="w-10 py-0.5 font-semibold text-gray-500"
              >
                {position}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TABLE_STRAINS.map((strain) => (
            <tr key={strain}>
              <th
                className={`text-right pr-2 py-0.5 font-bold ${strainColor(strain)}`}
              >
                {strainSymbol(strain)}
              </th>
              {TABLE_POSITIONS.map((position) => {
                const highlighted =
                  contract?.strain === strain && declarer === position;
                return (
                  <td
                    key={position}
                    className={`text-center tabular-nums py-0.5 ${
                      highlighted
                        ? "font-bold text-blue-900 bg-blue-100 rounded ring-1 ring-blue-300"
                        : "text-gray-700"
                    }`}
                  >
                    {table[strain][position]}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
