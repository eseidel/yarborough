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

function gameLevel(strain: StrainName): number {
  return strain === "N" ? 3 : strain === "H" || strain === "S" ? 4 : 5;
}

/**
 * The side's makeable contracts of `cls`, named the way they are bid: a game
 * is "3NT" even when the cards take ten tricks, since 4NT is not a contract
 * anyone chooses on purpose.
 */
function highestOfClass(
  contracts: MakeableContract[],
  cls: ContractClass,
): MakeableContract[] {
  return contracts
    .filter((c) => contractClass(c.level, c.strain) === cls)
    .map((c) => (cls === "game" ? { ...c, level: gameLevel(c.strain) } : c));
}

/**
 * How the contract compares with what the cards allow, from `userSide`'s
 * point of view. `contract` is null for a passed-out board.
 */
export function biddingVerdict(
  contract: ContractInfo | null,
  declarer: Position | null,
  table: DoubleDummyTable,
  userSide: Side,
): PlayVerdict {
  const us = SIDE_LABEL[userSide];
  const ours = makeableContracts(table, userSide);
  const ourBest = bestClass(ours);
  const theirs = makeableContracts(table, otherSide(userSide));

  if (!contract || !declarer) {
    if (ourBest && ourBest !== "partscore") {
      return {
        text: `Passed out, but ${us} can make ${listContracts(highestOfClass(ours, ourBest))}.`,
        tone: "bad",
      };
    }
    if (ourBest === "partscore") {
      return {
        text: `Passed out. ${us} could make ${listContracts(ours)}, but no game.`,
        tone: "mixed",
      };
    }
    const them =
      theirs.length > 0
        ? `${describeMakeable(otherSide(userSide), theirs)}.`
        : "and neither can the opponents.";
    return {
      text: `Passed out. ${us} can make nothing, ${them}`,
      tone: "good",
    };
  }

  const name = formatContract(
    contract.level,
    contract.strain,
    contract.doubled,
  );
  const tricks = table[contract.strain][declarer];
  const makes = contractMakes(contract.level, tricks);

  if (sideOf(declarer) === userSide) {
    const cls = contractClass(contract.level, contract.strain);
    if (makes) {
      if (ourBest === null || classRank(cls) >= classRank(ourBest)) {
        if (cls === "partscore") {
          return {
            text: `${name} makes, and there is no game for ${us}.`,
            tone: "good",
          };
        }
        return {
          text: `${name} makes: ${us} reached the ${cls} the cards allow.`,
          tone: "good",
        };
      }
      return {
        text: `${name} makes, but ${us} can make ${ourBest} in ${listContracts(highestOfClass(ours, ourBest))}.`,
        tone: "mixed",
      };
    }
    if (ours.length === 0) {
      return {
        text: `${name} ${describePlay(contract.level, tricks)}. ${us} can make nothing on these cards.`,
        tone: "bad",
      };
    }
    return {
      text: `${name} ${describePlay(contract.level, tricks)}. ${us} can make ${listContracts(ours)}.`,
      tone: "bad",
    };
  }

  const theirResult = `${formatContractBy(contract, declarer)} ${describePlay(contract.level, tricks)}.`;
  if (ourBest && ourBest !== "partscore") {
    return {
      text: `${theirResult} ${us} can make ${listContracts(highestOfClass(ours, ourBest))}: a missed ${ourBest}.`,
      tone: "bad",
    };
  }
  if (ourBest === "partscore") {
    return {
      text: `${theirResult} ${us} could make ${listContracts(ours)}.`,
      tone: makes ? "mixed" : "good",
    };
  }
  return {
    text: `${theirResult} ${us} can make nothing, so defending is right.`,
    tone: "good",
  };
}
