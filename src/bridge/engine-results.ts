import type { Call, CallInterpretation, StrainName } from "./types";

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

export function parseCallInterpretation(value: unknown): CallInterpretation {
  const interpretation = record(value, "call interpretation");
  return {
    call: parseCallName(interpretation.call_name),
    ruleName: optionalString(interpretation.rule_name, "rule name"),
    description: optionalString(interpretation.description, "description"),
    constraints: optionalString(
      interpretation.knowledge_string ?? interpretation.constraints,
      "constraints",
    ),
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
