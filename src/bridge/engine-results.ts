import type {
  AdaptiveBoard,
  Call,
  CallFit,
  CallInterpretation,
  HandAnalysis,
  HandCallAnalysis,
  Miss,
  OpeningLead,
  PointRule,
  Position,
  PreferEntry,
  Preference,
  ShapeFact,
  StrainName,
  SuitName,
} from "./types";
import { parseCardName } from "../dds/dds-core";

function record(value: unknown, description: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new Error(`The bidding engine returned an invalid ${description}`);
  }
  return value as Record<string, unknown>;
}

function optionalString(
  value: unknown,
  description: string,
): string | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`The bidding engine returned an invalid ${description}`);
  }
  return value;
}

export function parseCallName(value: unknown): Call {
  if (typeof value !== "string") {
    throw new Error("The bidding engine returned a non-string call");
  }
  if (value === "P") return { type: "pass" };
  if (value === "X") return { type: "double" };
  if (value === "XX") return { type: "redouble" };
  if (!/^[1-7][CDHSN]$/.test(value)) {
    throw new Error(`The bidding engine returned an invalid call: ${value}`);
  }

  return {
    type: "bid",
    level: Number(value[0]),
    strain: value[1] as StrainName,
  };
}

function optionalCategory(value: unknown): string[] | undefined {
  if (value === null || value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every((level) => typeof level === "string" && level.length > 0)
  ) {
    throw new Error("The bidding engine returned an invalid category");
  }
  return value as string[];
}

export function parseCallInterpretation(value: unknown): CallInterpretation {
  const interpretation = record(value, "call interpretation");
  const category = optionalCategory(interpretation.category);
  return {
    call: parseCallName(interpretation.call_name),
    ruleName: optionalString(interpretation.rule_name, "rule name"),
    description: optionalString(interpretation.description, "description"),
    constraints: optionalString(
      interpretation.knowledge_string ?? interpretation.constraints,
      "constraints",
    ),
    ...(category ? { category } : {}),
  };
}

export function parseCallInterpretations(value: unknown): CallInterpretation[] {
  if (!Array.isArray(value)) {
    throw new Error("The bidding engine returned invalid call interpretations");
  }
  return value.map(parseCallInterpretation);
}

export function parseStringResult(value: unknown, description: string): string {
  if (typeof value !== "string") {
    throw new Error(`The bidding engine returned an invalid ${description}`);
  }
  return value;
}

function suitList(value: unknown, description: string): SuitName[] {
  if (
    !Array.isArray(value) ||
    !value.every((suit) => typeof suit === "string" && /^[CDHS]$/.test(suit))
  ) {
    throw new Error(`The bidding engine returned invalid ${description}`);
  }
  return value as SuitName[];
}

export function parseOpeningLead(value: unknown): OpeningLead {
  const lead = record(value, "opening lead");
  if (typeof lead.leader !== "string" || !/^[NESW]$/.test(lead.leader)) {
    throw new Error("The bidding engine returned an invalid leader");
  }
  if (typeof lead.card !== "string") {
    throw new Error("The bidding engine returned an invalid lead card");
  }
  return {
    leader: lead.leader as Position,
    card: parseCardName(lead.card),
    reason: optionalString(lead.reason, "lead reason") ?? "",
    partnerSuits: suitList(lead.partner_suits, "partner suits"),
    theirSuits: suitList(lead.their_suits, "declaring side suits"),
  };
}

/** The adaptive generator's answer: a board, or null when its attempts ran out. */
export function parseAdaptiveBoard(value: unknown): AdaptiveBoard | null {
  if (value === null || value === undefined) return null;
  const board = record(value, "adaptive board");
  const category = optionalCategory(board.category);
  if (typeof board.identifier !== "string" || !category) {
    throw new Error("The bidding engine returned an invalid adaptive board");
  }
  return { identifier: board.identifier, category };
}

const CALL_FITS: readonly CallFit[] = [
  "chosen",
  "possible",
  "unfit",
  "planned",
  "no_rule",
];
const PREFERENCE_KINDS: readonly Preference["kind"][] = [
  "purpose",
  "strain",
  "fallback",
  "rule",
  "tie",
];
const ENTRY_KINDS: readonly PreferEntry["kind"][] = [
  "longest",
  "highest",
  "higher_suit",
  "lowest_level",
  "named",
  "conditional",
  "unnamed",
];

function oneOf<T extends string>(
  value: unknown,
  choices: readonly T[],
  description: string,
): T {
  if (
    typeof value !== "string" ||
    !(choices as readonly string[]).includes(value)
  ) {
    throw new Error(`The bidding engine returned an invalid ${description}`);
  }
  return value as T;
}

function count(value: unknown, description: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`The bidding engine returned an invalid ${description}`);
  }
  return value;
}

function suitName(value: unknown): SuitName {
  return oneOf(value, ["C", "D", "H", "S"] as const, "suit");
}

function parseShapeFact(value: unknown): ShapeFact {
  const fact = record(value, "shape");
  switch (fact.kind) {
    case "lengths": {
      if (!Array.isArray(fact.lengths) || !fact.lengths.length) {
        throw new Error("The bidding engine returned an invalid shape");
      }
      return {
        kind: "lengths",
        lengths: fact.lengths.map((item: unknown) => {
          const entry = record(item, "suit length");
          return {
            suit: suitName(entry.suit),
            length: count(entry.length, "suit length"),
            ...(entry.bid_by == null
              ? {}
              : {
                  bidBy: oneOf(
                    entry.bid_by,
                    ["partner", "opponents"] as const,
                    "suit bidder",
                  ),
                }),
          };
        }),
      };
    }
    case "shortest":
      return { kind: "shortest", length: count(fact.length, "suit length") };
    case "balanced":
      if (typeof fact.balanced !== "boolean") {
        throw new Error("The bidding engine returned an invalid shape");
      }
      return { kind: "balanced", balanced: fact.balanced };
    default:
      throw new Error("The bidding engine returned an invalid shape");
  }
}

function parseMiss(value: unknown): Miss {
  const miss = record(value, "miss");
  switch (miss.kind) {
    case "points":
      return {
        kind: "points",
        min: count(miss.min, "point bound"),
        max: count(miss.max, "point bound"),
        actual: count(miss.actual, "point count"),
        withShape: miss.with_shape === true,
        ...(miss.shape == null ? {} : { shape: parseShapeFact(miss.shape) }),
      };
    case "length":
      return {
        kind: "length",
        suit: suitName(miss.suit),
        min: count(miss.min, "length bound"),
        max: count(miss.max, "length bound"),
        actual: count(miss.actual, "length"),
      };
    case "balanced":
    case "shape":
      return { kind: miss.kind };
    case "honors":
      return miss.suit === null || miss.suit === undefined
        ? { kind: "honors" }
        : { kind: "honors", suit: suitName(miss.suit) };
  }
  throw new Error("The bidding engine returned an invalid miss");
}

function parsePreference(value: unknown): Preference | undefined {
  if (value === null || value === undefined) return undefined;
  const preference = record(value, "preference");
  const purpose = optionalString(preference.purpose, "purpose");
  const overPurpose = optionalString(preference.over_purpose, "purpose");
  if (!purpose || !overPurpose) {
    throw new Error("The bidding engine returned an invalid preference");
  }
  let entry: PreferEntry | undefined;
  if (preference.entry !== null && preference.entry !== undefined) {
    const raw = record(preference.entry, "preference entry");
    if (!Array.isArray(raw.calls)) {
      throw new Error(
        "The bidding engine returned an invalid preference entry",
      );
    }
    entry = {
      kind: oneOf(raw.kind, ENTRY_KINDS, "preference entry"),
      calls: raw.calls.map(parseCallName),
    };
  }
  return {
    kind: oneOf(preference.kind, PREFERENCE_KINDS, "preference"),
    over: parseCallName(preference.over),
    purpose,
    overPurpose,
    ...(entry ? { entry } : {}),
  };
}

const POINT_RULES: readonly PointRule[] = [
  "rule_of_20",
  "rule_of_19",
  "rule_of_15",
];

function parseHandCallAnalysis(value: unknown): HandCallAnalysis {
  const analysis = record(value, "hand call analysis");
  if (!Array.isArray(analysis.misses)) {
    throw new Error("The bidding engine returned invalid misses");
  }
  const preference = parsePreference(analysis.preference);
  const pointRule =
    analysis.point_rule == null
      ? null
      : oneOf(analysis.point_rule, POINT_RULES, "point rule");
  return {
    ...parseCallInterpretation(analysis),
    fit: oneOf(analysis.fit, CALL_FITS, "call fit"),
    misses: analysis.misses.map(parseMiss),
    ...(pointRule ? { pointRule } : {}),
    ...(preference ? { preference } : {}),
  };
}

/** Read the engine's answer for one hand at one point in an auction. */
export function parseHandAnalysis(value: unknown): HandAnalysis {
  const analysis = record(value, "hand analysis");
  if (!Array.isArray(analysis.calls)) {
    throw new Error("The bidding engine returned an invalid hand analysis");
  }
  const category = optionalCategory(analysis.category);
  const callName = analysis.call_name;
  return {
    ...(callName ? { call: parseCallName(callName) } : {}),
    ...(category ? { category } : {}),
    calls: analysis.calls.map(parseHandCallAnalysis),
  };
}
