// The double-dummy table, read out in words a learner can act on: what the
// contract does, what each side could have made, and how the bidding
// compares with the cards.

import type { Position, StrainName } from "../bridge/types";
import { POSITION_NAMES, strainSymbol } from "../bridge/types";
import type { ContractInfo } from "../bridge/auction";
import type { DoubleDummyTable } from "../dds/dds-core";
import { tricksRequired } from "../dds/dds-core";

export type Side = "NS" | "EW";

export const SIDE_LABEL: Record<Side, string> = { NS: "N-S", EW: "E-W" };
const SIDE_SEATS: Record<Side, Position[]> = { NS: ["N", "S"], EW: ["E", "W"] };
/** Strain order for listing contracts at the same level: notrump first. */
const STRAIN_RANK: StrainName[] = ["N", "S", "H", "D", "C"];

export function sideOf(position: Position): Side {
  return position === "N" || position === "S" ? "NS" : "EW";
}

export function otherSide(side: Side): Side {
  return side === "NS" ? "EW" : "NS";
}

export interface MakeableContract {
  level: number;
  strain: StrainName;
  declarer: Position;
  tricks: number;
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
    let best: MakeableContract | null = null;
    for (const declarer of SIDE_SEATS[side]) {
      const tricks = table[strain][declarer];
      if (tricks >= 7 && (!best || tricks > best.tricks)) {
        best = { level: tricks - 6, strain, declarer, tricks };
      }
    }
    if (best) contracts.push(best);
  }
  return contracts.sort(
    (a, b) =>
      b.level - a.level ||
      STRAIN_RANK.indexOf(a.strain) - STRAIN_RANK.indexOf(b.strain),
  );
}

export type ContractClass = "partscore" | "game" | "small slam" | "grand slam";
const CLASS_RANK: ContractClass[] = [
  "partscore",
  "game",
  "small slam",
  "grand slam",
];

export function contractClass(
  level: number,
  strain: StrainName,
): ContractClass {
  if (level === 7) return "grand slam";
  if (level === 6) return "small slam";
  const gameLevel =
    strain === "N" ? 3 : strain === "H" || strain === "S" ? 4 : 5;
  return level >= gameLevel ? "game" : "partscore";
}

function classRank(contractClass: ContractClass): number {
  return CLASS_RANK.indexOf(contractClass);
}

/** The most valuable class among `contracts`, or null when there are none. */
export function bestClass(contracts: MakeableContract[]): ContractClass | null {
  let best: ContractClass | null = null;
  for (const contract of contracts) {
    const cls = contractClass(contract.level, contract.strain);
    if (best === null || classRank(cls) > classRank(best)) best = cls;
  }
  return best;
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

function listContracts(contracts: MakeableContract[]): string {
  return contracts.map((c) => formatContract(c.level, c.strain)).join(", ");
}

/** "N-S can make 4♠, 3NT, 2♦" or "E-W can make nothing". */
export function describeMakeable(
  side: Side,
  contracts: MakeableContract[],
): string {
  const label = SIDE_LABEL[side];
  if (contracts.length === 0) return `${label} can make nothing`;
  return `${label} can make ${listContracts(contracts)}`;
}

export interface PlayVerdict {
  text: string;
  tone: "good" | "mixed" | "bad";
}

/**
 * How the bidding compares with what the cards allow, from `userSide`'s
 * point of view: a judgment in a few words. It names neither the contract's
 * own result nor the contracts each side can make, since the play card
 * gives both of those on their own lines. `contract` is null for a
 * passed-out board.
 */
export function biddingVerdict(
  contract: ContractInfo | null,
  declarer: Position | null,
  table: DoubleDummyTable,
  userSide: Side,
): PlayVerdict {
  const us = SIDE_LABEL[userSide];
  const ourBest = bestClass(makeableContracts(table, userSide));

  if (!contract || !declarer) {
    if (ourBest && ourBest !== "partscore") {
      return {
        text: `Passed out with a ${ourBest} available to ${us}.`,
        tone: "bad",
      };
    }
    if (ourBest === "partscore") {
      return {
        text: `Passed out with only a partscore available to ${us}.`,
        tone: "mixed",
      };
    }
    return { text: `Passed out, and ${us} can make nothing.`, tone: "good" };
  }

  const tricks = table[contract.strain][declarer];
  const makes = contractMakes(contract.level, tricks);

  if (sideOf(declarer) === userSide) {
    const cls = contractClass(contract.level, contract.strain);
    if (!makes) return { text: "Too high for these cards.", tone: "bad" };
    if (ourBest === null || classRank(cls) >= classRank(ourBest)) {
      return cls === "partscore"
        ? { text: `There is no game for ${us}.`, tone: "good" }
        : { text: `${us} reached the ${cls} the cards allow.`, tone: "good" };
    }
    return cls === "partscore"
      ? { text: `${us} stopped short of game.`, tone: "mixed" }
      : { text: `${us} missed a ${ourBest}.`, tone: "mixed" };
  }

  if (ourBest && ourBest !== "partscore") {
    return { text: `A missed ${ourBest} for ${us}.`, tone: "bad" };
  }
  if (ourBest === "partscore" && makes) {
    return { text: `${us} could have competed in a partscore.`, tone: "mixed" };
  }
  return { text: "Defending was right.", tone: "good" };
}
