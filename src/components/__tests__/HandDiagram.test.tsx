import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HandDiagram } from "../HandDiagram";
import { MOCK_DEAL, MOCK_VOID_DEAL } from "../../bridge/mock";
import type { Position } from "../../bridge/types";
import type { DoubleDummyTable } from "../../dds/dds-core";

// N-S make 4♠ (10 tricks) and 3NT (9, North only); E-W make 2♥ and 1♣.
const TABLE: DoubleDummyTable = {
  S: { N: 10, E: 3, S: 10, W: 3 },
  H: { N: 5, E: 8, S: 5, W: 8 },
  D: { N: 8, E: 5, S: 8, W: 5 },
  C: { N: 6, E: 7, S: 6, W: 7 },
  N: { N: 9, E: 4, S: 6, W: 4 },
};

/** A hand's four holdings, top to bottom, as they read on screen. */
function holdings(position: Position): string[] {
  const rows = within(screen.getByTestId(`hand-${position}`)).getByTestId(
    "suit-rows",
  );
  return [...rows.children].map((row) => row.textContent ?? "");
}

describe("HandDiagram", () => {
  it("lays the hands out as a bridge diagram: North, West, East, South", () => {
    render(<HandDiagram deal={MOCK_DEAL} userPosition="S" />);
    const order = screen
      .getAllByTestId(/^hand-[NESW]$/)
      .map((el) => el.getAttribute("data-testid"));
    expect(order).toEqual(["hand-N", "hand-W", "hand-E", "hand-S"]);
  });

  it("gives each hand its seat, its points, and a line per suit", () => {
    render(<HandDiagram deal={MOCK_DEAL} userPosition="S" />);
    expect(holdings("N")).toEqual(["♠ AK32", "♥ QJ4", "♦ 987", "♣ 654"]);
    // Tens read as "10", so a holding is never ambiguous.
    expect(holdings("E")).toEqual(["♠ QJ9", "♥ 1098", "♦ AKJ", "♣ 10982"]);

    const north = screen.getByTestId("hand-N");
    // The seat and its points; the column is too narrow to spell out "HCP".
    expect(within(north).getByTestId("position-label-N")).toHaveTextContent(
      "North 10",
    );
    expect(within(north).getByTitle("10 high-card points")).toBeInTheDocument();
    expect(within(north).queryByText(/\(you\)/)).toBeNull();

    expect(screen.getByTestId("position-label-S")).toHaveTextContent(
      /South\s*\(you\)\s*13/,
    );
  });

  it("keeps a void's line, so the hands read row for row", () => {
    render(<HandDiagram deal={MOCK_VOID_DEAL} />);
    expect(holdings("W")).toEqual(["♠ AKQ", "♥ —", "♦ AKQJ10", "♣ AKQJ10"]);
  });

  it("hugs East against the middle of the diagram", () => {
    render(<HandDiagram deal={MOCK_DEAL} />);
    expect(screen.getByTestId("hand-E").className).toContain("text-right");
    for (const position of ["N", "W", "S"]) {
      expect(screen.getByTestId(`hand-${position}`).className).toContain(
        "text-left",
      );
    }
  });

  it("states each side's points and fits", () => {
    render(<HandDiagram deal={MOCK_DEAL} />);
    // N-S: 10 + 13 = 23 HCP with 4+4 spades.
    expect(screen.getByTestId("side-NS").textContent).toBe(
      "N-S 23 HCP · 8-card ♠ fit",
    );
    // E-W: 11 + 6 = 17 HCP, no eight-card suit.
    expect(screen.getByTestId("side-EW").textContent).toBe(
      "E-W 17 HCP · no 8-card fit",
    );
  });

  it("adds what each side can make once the solver answers", () => {
    // The points, the fits and the makeable contracts are all facts about
    // the cards, so a side reads as one line.
    render(<HandDiagram deal={MOCK_DEAL} table={TABLE} />);
    expect(screen.getByTestId("side-NS").textContent).toBe(
      "N-S 23 HCP · 8-card ♠ fit · can make 4♠, 3NT, 2♦",
    );
    expect(screen.getByTestId("side-EW").textContent).toBe(
      "E-W 17 HCP · no 8-card fit · can make 2♥, 1♣",
    );
  });

  it("says nothing about the play until the solver answers", () => {
    render(<HandDiagram deal={MOCK_DEAL} />);
    expect(screen.queryByTestId("makeable-NS")).toBeNull();
  });
});
