import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlayAnalysis } from "../PlayAnalysis";
import type { CallHistory } from "../../bridge/types";
import type { DoubleDummyTable } from "../../dds/dds-core";

const TABLE: DoubleDummyTable = {
  S: { N: 9, E: 3, S: 9, W: 3 },
  H: { N: 4, E: 9, S: 4, W: 9 },
  D: { N: 9, E: 3, S: 9, W: 3 },
  C: { N: 4, E: 9, S: 4, W: 9 },
  N: { N: 7, E: 3, S: 7, W: 3 },
};

// N 1S, E P, S 4S, W P, N P, E P: 4S by North.
const FOUR_SPADES: CallHistory = {
  dealer: "N",
  calls: [
    { type: "bid", level: 1, strain: "S" },
    { type: "pass" },
    { type: "bid", level: 4, strain: "S" },
    { type: "pass" },
    { type: "pass" },
    { type: "pass" },
  ],
};

const LEAD = {
  leader: "E" as const,
  card: { suit: "H" as const, rank: "8" as const },
  reason: "fourth best",
  partnerSuits: [],
  theirSuits: ["S" as const],
};

describe("PlayAnalysis", () => {
  it("states the contract's result, the lead's effect, and the verdict in words", () => {
    render(
      <PlayAnalysis
        history={FOUR_SPADES}
        analysis={{ table: TABLE, lead: LEAD, tricksAfterLead: 11 }}
      />,
    );
    expect(screen.getByTestId("double-dummy-contract").textContent).toBe(
      "4♠ by North goes down 1 (9 tricks) with all four hands in view and best play by both sides.",
    );
    const afterLead = screen.getByTestId("double-dummy-after-lead");
    expect(afterLead.textContent).toBe(
      "After East’s normal lead, the ♥8 (fourth best), it makes 5 (11 tricks): the defense no longer sees declarer’s cards before the first trick.",
    );
    // The verdict judges; the result above and the lists below are not repeated.
    expect(screen.getByTestId("play-verdict").textContent).toBe(
      "Too high for these cards.",
    );
    expect(screen.getByTestId("makeable-NS").textContent).toBe(
      "N-S can make 3♠, 3♦, 1NT.",
    );
    expect(screen.getByTestId("makeable-EW").textContent).toBe(
      "E-W can make 3♥, 3♣.",
    );
  });

  it("says when the lead changes nothing", () => {
    render(
      <PlayAnalysis
        history={FOUR_SPADES}
        analysis={{ table: TABLE, lead: LEAD, tricksAfterLead: 9 }}
      />,
    );
    expect(screen.getByTestId("double-dummy-after-lead").textContent).toBe(
      "East’s normal lead, the ♥8 (fourth best), does not change that.",
    );
  });

  it("shows no trick table", () => {
    render(
      <PlayAnalysis
        history={FOUR_SPADES}
        analysis={{ table: TABLE, lead: null, tricksAfterLead: null }}
      />,
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("judges a passed-out board", () => {
    render(
      <PlayAnalysis
        history={{
          dealer: "N",
          calls: [
            { type: "pass" },
            { type: "pass" },
            { type: "pass" },
            { type: "pass" },
          ],
        }}
        analysis={{ table: TABLE, lead: null, tricksAfterLead: null }}
      />,
    );
    expect(screen.queryByTestId("double-dummy-contract")).toBeNull();
    expect(screen.getByTestId("play-verdict").textContent).toBe(
      "Passed out with only a partscore available to N-S.",
    );
    expect(screen.getByTestId("makeable-NS").textContent).toBe(
      "N-S can make 3♠, 3♦, 1NT.",
    );
  });

  it("reports loading and failure", () => {
    const { rerender } = render(
      <PlayAnalysis history={FOUR_SPADES} analysis={null} loading />,
    );
    expect(screen.getByTestId("double-dummy-loading")).toBeInTheDocument();
    rerender(
      <PlayAnalysis
        history={FOUR_SPADES}
        analysis={null}
        error="the solver failed"
      />,
    );
    expect(screen.getByTestId("double-dummy-error").textContent).toContain(
      "the solver failed",
    );
  });
});
