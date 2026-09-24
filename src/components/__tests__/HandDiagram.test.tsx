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
/** Board 3: North deals, N-S vulnerable. */
const BOARD = { boardNumber: 3, dealer: "N", vulnerability: "NS" } as const;

/** A hand's four holdings, top to bottom, as they read on screen. */
function holdings(position: Position): string[] {
  const rows = within(screen.getByTestId(`hand-${position}`)).getByTestId(
    "suit-rows",
  );
  return [...rows.children].map((row) => row.textContent ?? "");
}

describe("HandDiagram", () => {
  it("lays the hands out as a bridge diagram: North, West, East, South", () => {
    render(<HandDiagram deal={MOCK_DEAL} userPosition="S" {...BOARD} />);
    const order = screen
      .getAllByTestId(/^hand-[NESW]$/)
      .map((el) => el.getAttribute("data-testid"));
    expect(order).toEqual(["hand-N", "hand-W", "hand-E", "hand-S"]);
  });

  it("gives each hand its seat, its points, and a line per suit", () => {
    render(<HandDiagram deal={MOCK_DEAL} userPosition="S" {...BOARD} />);
    expect(holdings("N")).toEqual(["♠AK32", "♥QJ4", "♦987", "♣654"]);
    // A ten is a T: one glyph in one column, where "10" reads as two cards.
    expect(holdings("E")).toEqual(["♠QJ9", "♥T98", "♦AKJ", "♣T982"]);

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
    render(<HandDiagram deal={MOCK_VOID_DEAL} {...BOARD} />);
    expect(holdings("W")).toEqual(["♠AKQ", "♥—", "♦AKQJT", "♣AKQJT"]);
  });

  it("hugs East against the middle, its suit symbols still in a column", () => {
    render(<HandDiagram deal={MOCK_DEAL} {...BOARD} />);
    // Each hand is one block, laid out left to right inside itself, so its
    // suit symbols line up whichever edge of its cell the block hugs.
    for (const position of ["N", "E", "S", "W"]) {
      expect(screen.getByTestId(`hand-${position}`).className).toContain(
        "text-left",
      );
    }
    expect(screen.getByTestId("hand-E").parentElement!.className).toContain(
      "text-right",
    );
    expect(screen.getByTestId("hand-W").parentElement!.className).toContain(
      "text-left",
    );
    // North and South start at one left edge rather than being centred
    // separately, which landed them at two.
    for (const position of ["N", "S"]) {
      expect(
        screen.getByTestId(`hand-${position}`).parentElement!.className,
      ).toContain("text-left");
    }
  });

  it("keeps the board, its dealer and its vulnerability in the middle", () => {
    render(<HandDiagram deal={MOCK_DEAL} {...BOARD} />);
    const note = screen.getByTestId("board-note");
    expect(note).toHaveTextContent("Board 3");
    expect(note).toHaveTextContent("North deals");
    expect(note).toHaveTextContent("N-S Vul");
  });

  it("states each side's points beside North", () => {
    render(<HandDiagram deal={MOCK_DEAL} {...BOARD} />);
    // N-S: 10 + 13 = 23 HCP. Their 4+4 spade fit is four holdings away,
    // in front of the reader, so the diagram does not spell it out.
    expect(screen.getByTestId("side-NS").textContent).toBe("N-S 23 HCP");
    // E-W: 11 + 6 = 17 HCP.
    expect(screen.getByTestId("side-EW").textContent).toBe("E-W 17 HCP");
  });

  it("lists what each side can make once the solver answers", () => {
    // No words in front of them: a list of contracts under a side's
    // points, beside the deal, is read for what it is.
    render(<HandDiagram deal={MOCK_DEAL} table={TABLE} {...BOARD} />);
    expect(screen.getByTestId("makeable-NS").textContent).toBe(
      "4♠, 3NT (N), 2♦",
    );
    expect(screen.getByTestId("makeable-EW").textContent).toBe("2♥, 1♣");
  });

  it("names the declarer when only one partner makes the contract", () => {
    // 3NT makes from North (9 tricks) and fails from South (6), so the
    // list must not suggest either partner can play it.
    render(<HandDiagram deal={MOCK_DEAL} table={TABLE} {...BOARD} />);
    expect(screen.getByTestId("makeable-NS").textContent).toContain("3NT (N)");
    expect(screen.getByTestId("makeable-NS").textContent).not.toContain("4♠ (");
  });

  it("gives the other partner's best in the strain beside it", () => {
    // South makes 1NT (7 tricks) where North makes 3NT.
    render(
      <HandDiagram
        deal={MOCK_DEAL}
        table={{ ...TABLE, N: { N: 9, E: 4, S: 7, W: 4 } }}
        {...BOARD}
      />,
    );
    expect(screen.getByTestId("makeable-NS").textContent).toBe(
      "4♠, 3NT (N), 1NT (S), 2♦",
    );
  });

  it("dashes a side that can make nothing", () => {
    const nothing = { N: 6, E: 6, S: 6, W: 6 };
    render(
      <HandDiagram
        deal={MOCK_DEAL}
        table={{ S: nothing, H: nothing, D: nothing, C: nothing, N: nothing }}
        {...BOARD}
      />,
    );
    expect(screen.getByTestId("makeable-NS").textContent).toBe("—");
  });

  it("says nothing about the play until the solver answers", () => {
    render(<HandDiagram deal={MOCK_DEAL} {...BOARD} />);
    expect(screen.queryByTestId("makeable-NS")).toBeNull();
  });
});
