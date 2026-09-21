import type {
  AdaptiveBoard,
  Bounds,
  Call,
  CallFit,
  CallInterpretation,
  CallRequirements,
  HandAnalysis,
  HandCallAnalysis,
  OpeningLead,
  Position,
  PreferenceReason,
  StrainName,
  SuitName,
  UnfitReason,
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

const CALL_FITS: CallFit[] = ["chosen", "possible", "unfit", "no_rule"];
const UNFIT_KINDS: UnfitReason["kind"][] = [
  "hcp_low",
  "hcp_high",
  "suit_short",
  "suit_long",
];

function parseBounds(value: unknown, description: string): Bounds {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !value.every((bound) => typeof bound === "number" && Number.isFinite(bound))
  ) {
    throw new Error(`The bidding engine returned invalid ${description}`);
  }
  return [value[0], value[1]] as Bounds;
}

function parseRequirements(value: unknown): CallRequirements | undefined {
  if (value === null || value === undefined) return undefined;
  const requirements = record(value, "call requirements");
  const suitLengths = requirements.suit_lengths;
  if (!Array.isArray(suitLengths) || suitLengths.length !== 4) {
    throw new Error("The bidding engine returned invalid suit requirements");
  }
  return {
    hcp: parseBounds(requirements.hcp, "point requirements"),
    suitLengths: suitLengths.map((bounds) =>
      parseBounds(bounds, "suit requirements"),
    ),
  };
}

function parseUnfitReason(value: unknown): UnfitReason | undefined {
  if (value === null || value === undefined) return undefined;
  const reason = record(value, "unfit reason");
  const kind = reason.kind;
  if (
    typeof kind !== "string" ||
    !(UNFIT_KINDS as string[]).includes(kind) ||
    typeof reason.shown !== "number" ||
    typeof reason.actual !== "number"
  ) {
    throw new Error("The bidding engine returned an invalid unfit reason");
  }
  const suit = reason.suit;
  if (suit !== null && suit !== undefined && !/^[CDHS]$/.test(String(suit))) {
    throw new Error("The bidding engine returned an invalid unfit suit");
  }
  return {
    kind: kind as UnfitReason["kind"],
    ...(suit ? { suit: suit as SuitName } : {}),
    shown: reason.shown,
    actual: reason.actual,
  };
}

const PREFERENCE_KINDS = ["purpose", "strain", "fallback", "rule"] as const;

function parsePreferenceReason(value: unknown): PreferenceReason | undefined {
  if (value === null || value === undefined) return undefined;
  const reason = record(value, "preference reason");
  const kind = reason.kind;
  if (
    typeof kind !== "string" ||
    !(PREFERENCE_KINDS as readonly string[]).includes(kind) ||
    typeof reason.purpose !== "string" ||
    typeof reason.chosen_purpose !== "string"
  ) {
    throw new Error("The bidding engine returned an invalid preference reason");
  }
  return {
    kind: kind as PreferenceReason["kind"],
    purpose: reason.purpose,
    chosenPurpose: reason.chosen_purpose,
  };
}

function parseHandCallAnalysis(value: unknown): HandCallAnalysis {
  const analysis = record(value, "hand call analysis");
  const fit = analysis.fit;
  if (typeof fit !== "string" || !(CALL_FITS as string[]).includes(fit)) {
    throw new Error("The bidding engine returned an invalid call fit");
  }
  const requirements = parseRequirements(analysis.requirements);
  const unfitReason = parseUnfitReason(analysis.unfit_reason);
  const preferenceReason = parsePreferenceReason(analysis.preference_reason);
  return {
    ...parseCallInterpretation(analysis),
    fit: fit as CallFit,
    ...(requirements ? { requirements } : {}),
    ...(unfitReason ? { unfitReason } : {}),
    ...(preferenceReason ? { preferenceReason } : {}),
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
