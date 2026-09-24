// The double-dummy table, read out in words a learner can act on: what the
// contract does, and what each side could have made.

import type { CallHistory, Position, StrainName } from "../bridge/types";
import { POSITION_NAMES, strainSymbol } from "../bridge/types";
import type { ContractInfo } from "../bridge/auction";
import { getContract, getDeclarer, isPassOut } from "../bridge/auction";
import type { DoubleDummyTable } from "../dds/dds-core";
import { tricksRequired } from "../dds/dds-core";

export type Side = "NS" | "EW";

export const SIDE_LABEL: Record<Side, string> = { NS: "N-S", EW: "E-W" };
const SIDE_SEATS: Record<Side, Position[]> = { NS: ["N", "S"], EW: ["E", "W"] };
/** Strain order for listing contracts at the same level: notrump first. */
const STRAIN_RANK: StrainName[] = ["N", "S", "H", "D", "C"];

export interface MakeableContract {
  level: number;
  strain: StrainName;
  declarer: Position;
  tricks: number;
  /** Whether the other partner takes as many tricks, so either can declare. */
  eitherDeclarer: boolean;
}

/**
 * The highest contract `side` can make in each strain, by whichever partner
 * takes more tricks, highest level first. Empty when the side makes nothing.
 */
export function makeableContracts(
  table: DoubleDummyTable,
  side: Side,
): MakeableContract[] {
  const contracts: MakeableContract[] = [];
  for (const strain of STRAIN_RANK) {
    const [first, second] = SIDE_SEATS[side];
    const declarer =
      table[strain][second] > table[strain][first] ? second : first;
    const tricks = table[strain][declarer];
    if (tricks >= 7) {
      contracts.push({
        level: tricks - 6,
        strain,
        declarer,
        tricks,
        eitherDeclarer: table[strain][first] === table[strain][second],
      });
    }
  }
  return contracts.sort(
    (a, b) =>
      b.level - a.level ||
      STRAIN_RANK.indexOf(a.strain) - STRAIN_RANK.indexOf(b.strain),
  );
}

/** "4♠", "3NT", "2♥X". */
export function formatContract(
  level: number,
  strain: StrainName,
  doubled?: "X" | "XX",
): string {
  return `${level}${strainSymbol(strain)}${doubled ?? ""}`;
}

/** "4♠ by North". */
export function formatContractBy(
  contract: ContractInfo,
  declarer: Position,
): string {
  return `${formatContract(contract.level, contract.strain, contract.doubled)} by ${POSITION_NAMES[declarer]}`;
}

/** "3NT by North", or "Passed out" where nobody bid. */
export function contractHeadline(history: CallHistory): string {
  if (isPassOut(history)) return "Passed out";
  const contract = getContract(history);
  const declarer = getDeclarer(history);
  return contract && declarer ? formatContractBy(contract, declarer) : "";
}

export function contractMakes(level: number, tricks: number): boolean {
  return tricks >= tricksRequired(level);
}

/** "makes 4 (10 tricks)", "makes 5 (11 tricks)", "goes down 2 (7 tricks)". */
export function describePlay(level: number, tricks: number): string {
  const needed = tricksRequired(level);
  const plural = tricks === 1 ? "trick" : "tricks";
  if (tricks < needed) {
    return `goes down ${needed - tricks} (${tricks} ${plural})`;
  }
  return `makes ${tricks - 6} (${tricks} ${plural})`;
}

/**
 * "4♠, 3NT (N), 2♦", and empty where a side can make none. A contract only
 * one partner makes names that partner, since from the other side of the
 * table it fails.
 */
export function listMakeable(contracts: MakeableContract[]): string {
  return contracts
    .map(
      (c) =>
        formatContract(c.level, c.strain) +
        (c.eitherDeclarer ? "" : ` (${c.declarer})`),
    )
    .join(", ");
}
