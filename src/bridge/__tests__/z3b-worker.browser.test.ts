import { describe, expect, it } from "vitest";
import {
  generateFilteredBoard,
  getCallInterpretations,
  getFullAutobid,
  getNextCall,
  getOpeningLead,
  getSuggestedCall,
} from "../engine";
import { parseBoardId } from "../identifier";
import { callToString } from "../types";
import goldenCases from "../../../tests/z3b_golden_cases.json";

describe("z3b browser worker", () => {
  it("loads the TypeScript engine and Z3 for every public engine operation", async () => {
    // The first request pays for the engine chunk and the Z3 module: the
    // time to the first bid of a fresh worker.
    const started = performance.now();
    const interpretations = await getCallInterpretations("", "N", "None");
    console.log(
      `z3b worker: first response in ${(performance.now() - started).toFixed(0)} ms`,
    );
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
        category: goldenCase.category,
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

  // The worker lives as long as the page, so a solver or history that is not
  // released shows up as a heap that grows with every request. This drives the
  // one worker through the operations a practice session issues, many times
  // over, and fails on the first request that does not come back.
  it("serves a long run of sequential requests over generated boards", async () => {
    const BOARDS = 10;
    let requests = 0;
    const started = performance.now();

    for (let board = 0; board < BOARDS; board++) {
      const identifier = await generateFilteredBoard("Random");
      requests += 1;
      const parsed = parseBoardId(identifier);
      if (!parsed) throw new Error(`invalid board identifier ${identifier}`);

      const suggestion = await getSuggestedCall(identifier);
      requests += 1;
      expect(suggestion.call.type).toMatch(/^(pass|bid|double|redouble)$/);

      const auction = await getFullAutobid(identifier);
      requests += 1;
      const calls = auction.map(callToString);
      expect(calls.length).toBeGreaterThanOrEqual(4);
      expect(calls.slice(-3)).toEqual(["P", "P", "P"]);

      // The explorer asks about the position after the first two calls.
      const interpretations = await getCallInterpretations(
        calls.slice(0, 2).join(","),
        parsed.dealer,
        parsed.vulnerability,
      );
      requests += 1;
      expect(interpretations.length).toBeGreaterThan(0);

      const completed = `${identifier}:${calls.join(",")}`;
      const passedOut = calls.every((call) => call === "P");
      if (passedOut) {
        await expect(getOpeningLead(completed)).rejects.toThrow(
          "the board was passed out",
        );
      } else {
        const lead = await getOpeningLead(completed);
        expect(["N", "E", "S", "W"]).toContain(lead.leader);
        expect(lead.card.suit).toMatch(/^[CDHS]$/);
      }
      requests += 1;
    }

    const elapsed = performance.now() - started;
    expect(requests).toBeGreaterThanOrEqual(40);
    console.log(
      `z3b worker soak: ${requests} requests over ${BOARDS} boards in ` +
        `${elapsed.toFixed(0)} ms (${(elapsed / requests).toFixed(0)} ms per request)`,
    );
  });
});
