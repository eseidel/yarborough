import type { Call, CallInterpretation, StrainName } from "./types";

// These will be resolved after wasm-pack builds the crate
import init, {
  get_interpretations,
  get_next_bid,
  get_suggested_bid,
  generate_filtered_board,
} from "../../crates/wasm/pkg/wasm";

let initialized = false;

async function ensureInit() {
  if (!initialized) {
    await init();
    initialized = true;
  }
}

interface RawInterpretation {
  call_name: string;
  rule_name: string;
  description: string;
}

/** Parse a call string in the Rust engine's format: "P", "X", "XX", "1C", "2N", etc. */
function parseCallName(name: string): Call {
  if (name === "P") return { type: "pass" };
  if (name === "X") return { type: "double" };
  if (name === "XX") return { type: "redouble" };

  const level = parseInt(name[0], 10);
  const strainMap: Record<string, StrainName> = {
    C: "C",
    D: "D",
    H: "H",
    S: "S",
    N: "N",
  };
  const strain = strainMap[name.slice(1)] ?? "N";
  return { type: "bid", level, strain };
}

/** Call the WASM engine to get bid interpretations for the current auction state. */
export async function getInterpretations(
  callsString: string,
  dealer: string,
  vulnerability: string = "None",
): Promise<CallInterpretation[]> {
  await ensureInit();

  const raw = get_interpretations(
    callsString,
    dealer,
    vulnerability,
  ) as RawInterpretation[];

  return raw.map((r) => ({
    call: parseCallName(r.call_name),
    ruleName: r.rule_name,
    description: r.description,
  }));
}

/**
 * Call the WASM engine to get the next bid for the current player.
 * @param identifier - Board identifier in format "<board>-<hex>[:<calls>]"
 */
export async function getNextBid(identifier: string): Promise<Call> {
  await ensureInit();
  const result = get_next_bid(identifier);
  return parseCallName(result);
}

/**
 * Call the WASM engine to get a suggested bid with its interpretation.
 * Returns the bid the engine would make plus its rule name and description.
 * @param identifier - Board identifier in format "<board>-<hex>[:<calls>]"
 */
export async function getSuggestedBid(
  identifier: string,
): Promise<CallInterpretation> {
  await ensureInit();
  const raw = get_suggested_bid(identifier) as RawInterpretation;
  return {
    call: parseCallName(raw.call_name),
    ruleName: raw.rule_name,
    description: raw.description,
  };
}

/**
 * Call the WASM engine to generate a board matching the given type.
 * @param type - DealType string
 */
export async function generateFilteredBoard(type: string): Promise<string> {
  await ensureInit();
  return generate_filtered_board(type);
}
