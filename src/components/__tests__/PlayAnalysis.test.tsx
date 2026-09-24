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
  it("says what the standard lead does to the contract, and nothing else", () => {
    render(
      <PlayAnalysis
        history={FOUR_SPADES}
        analysis={{ table: TABLE, lead: LEAD, tricksAfterLead: 11 }}
      />,
    );
    // The contract and its result are the card's headline, above this.
    expect(screen.queryByTestId("double-dummy-contract")).toBeNull();
    expect(screen.getByTestId("double-dummy-after-lead").textContent).toBe(
      "The result above assumes the defense finds the best opening lead. If East makes the standard lead, the ♥8 (fourth best), and both sides play perfectly after that, 4♠ makes 5 (11 tricks).",
    );
    // No judgment of the bidding: the results speak for themselves.
    expect(screen.queryByTestId("play-verdict")).toBeNull();
    expect(screen.queryByTestId("makeable-NS")).toBeNull();
  });

  it("says when the lead changes nothing", () => {
    render(
      <PlayAnalysis
        history={FOUR_SPADES}
        analysis={{ table: TABLE, lead: LEAD, tricksAfterLead: 9 }}
      />,
    );
    expect(screen.getByTestId("double-dummy-after-lead").textContent).toBe(
      "If East makes the standard lead, the ♥8 (fourth best), and both sides play perfectly after that, the result is the same.",
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

  it("shows nothing for a passed-out board", () => {
    const { container } = render(
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
    expect(container).toBeEmptyDOMElement();
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
