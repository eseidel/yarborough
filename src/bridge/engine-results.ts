import type {
  Call,
  CallInterpretation,
  OpeningLead,
  Position,
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
