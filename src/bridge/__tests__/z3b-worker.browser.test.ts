import { describe, expect, it } from "vitest";
import {
  generateFilteredBoard,
  getCallInterpretations,
  getNextCall,
  getOpeningLead,
  getSuggestedCall,
} from "../engine";
import { parseBoardId } from "../identifier";
import { callToString } from "../types";
import goldenCases from "../../../tests/z3b_golden_cases.json";

describe("z3b browser worker", () => {
  it("loads Pyodide and local Z3 assets for every public engine operation", async () => {
    const interpretations = await getCallInterpretations("", "N", "None");
    expect(interpretations).toContainEqual({
      call: { type: "pass" },
      ruleName: "Default Pass",
      description: undefined,
      constraints: "0-12 hcp",
    });

    for (const goldenCase of goldenCases) {
      const nextCall = await getNextCall(goldenCase.identifier);
      const suggestion = await getSuggestedCall(goldenCase.identifier);
      expect(callToString(nextCall)).toBe(goldenCase.call_name);
      expect(suggestion).toEqual({
        call: nextCall,
        ruleName: goldenCase.rule_name ?? undefined,
        description: goldenCase.description ?? undefined,
        constraints: goldenCase.knowledge_string ?? undefined,
      });
    }

    const identifier = await generateFilteredBoard("Random");
    expect(parseBoardId(identifier)).not.toBeNull();
  });

  it("chooses an opening lead against a completed auction", async () => {
    // The Strong2C golden board opens 2C; bid it out with the autobidder first.
    const opening = goldenCases.find((c) => c.call_name === "2C");
    if (!opening) throw new Error("no 2C golden case");
    const calls: string[] = [];
    let identifier = opening.identifier;
    for (let i = 0; i < 40; i++) {
      const call = await getNextCall(identifier);
      calls.push(callToString(call));
      identifier = `${opening.identifier}:${calls.join(",")}`;
      if (calls.length >= 4 && calls.slice(-3).every((c) => c === "P")) break;
    }
    const lead = await getOpeningLead(identifier);
    expect(["N", "E", "S", "W"]).toContain(lead.leader);
    expect(lead.card.suit).toMatch(/^[CDHS]$/);
    expect(lead.reason.length).toBeGreaterThan(0);
  });

  it("generates each named practice focus using its z3b opening rule", async () => {
    const focusedRules = {
      Notrump: "Notrump Opening",
      Preempt: "Preemptive Open",
      Strong2C: "Strong Two Clubs",
    };

    for (const [focus, expectedRule] of Object.entries(focusedRules)) {
      const identifier = await generateFilteredBoard(focus);
      expect(parseBoardId(identifier)).not.toBeNull();
      await expect(getSuggestedCall(identifier)).resolves.toMatchObject({
        ruleName: expectedRule,
      });
    }
  });
});
