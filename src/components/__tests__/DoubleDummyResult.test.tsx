import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DoubleDummyResult } from "../DoubleDummyResult";
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

describe("DoubleDummyResult", () => {
  it("shows the contract's double-dummy result and the after-lead result", () => {
    render(
      <DoubleDummyResult
        history={FOUR_SPADES}
        analysis={{
          table: TABLE,
          lead: {
            leader: "E",
            card: { suit: "H", rank: "8" },
            reason: "fourth best",
            partnerSuits: [],
            theirSuits: ["S"],
          },
          tricksAfterLead: 11,
        }}
      />,
    );
    expect(screen.getByTestId("double-dummy-contract").textContent).toBe(
      "down 1 (9 tricks)",
    );
    const afterLead = screen.getByTestId("double-dummy-after-lead");
    expect(afterLead.textContent).toContain("After East leads");
    expect(afterLead.textContent).toContain("makes 5 (11 tricks)");
    expect(afterLead.textContent).toContain("fourth best");
    // Every cell of the table, notrump first.
    const rows = screen
      .getByTestId("double-dummy-table")
      .querySelectorAll("tbody tr");
    expect(rows).toHaveLength(5);
    expect(rows[0].textContent).toBe("NT7373");
    expect(rows[1].textContent).toBe("♠9393");
  });

  it("shows only the table for a passed-out board", () => {
    render(
      <DoubleDummyResult
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
    expect(screen.getByTestId("double-dummy-table")).toBeInTheDocument();
    expect(screen.queryByTestId("double-dummy-contract")).toBeNull();
  });

  it("reports loading and failure", () => {
    const { rerender } = render(
      <DoubleDummyResult history={FOUR_SPADES} analysis={null} loading />,
    );
    expect(screen.getByTestId("double-dummy-loading")).toBeInTheDocument();
    rerender(
      <DoubleDummyResult
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
