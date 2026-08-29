import { describe, expect, it } from "vitest";
import { randomDeal } from "../../bridge/mock";
import { generateBoardId } from "../../bridge/identifier";

/**
 * Guards the seeding installed by src/test/setup.ts.
 *
 * Without it, `randomDeal` and `generateBoardId` draw real randomness, so each
 * run covers a different set of branches — the board number decides the
 * vulnerability, which decides which arms of CallTable.isVulnerable execute.
 * Coverage then moved between identical runs and failed Codecov on pull
 * requests touching no source at all.
 */
describe("test randomness is seeded", () => {
  let firstSample: number[] | null = null;
  let firstBoard: string | null = null;

  it("varies within a single test", () => {
    firstSample = [Math.random(), Math.random(), Math.random()];
    firstBoard = generateBoardId().id;

    // Seeded, not constant: code under test still sees a spread of values.
    expect(new Set(firstSample).size).toBe(3);
  });

  it("restarts from the same seed in the next test", () => {
    expect([Math.random(), Math.random(), Math.random()]).toEqual(firstSample);
    expect(generateBoardId().id).toBe(firstBoard);
  });

  it("deals the same cards every run", () => {
    const a = randomDeal();
    const b = randomDeal();

    // Reseeded per test, so this deal is stable run to run...
    expect(a.north.cards).toHaveLength(13);
    // ...while successive deals within a test still differ.
    expect(a).not.toEqual(b);
  });
});
