import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HandDiagram } from "../HandDiagram";
import { MOCK_DEAL } from "../../bridge/mock";

describe("HandDiagram", () => {
  it("lays the hands out North, West and East, then South, with points", () => {
    render(<HandDiagram deal={MOCK_DEAL} userPosition="S" />);
    const order = screen
      .getAllByTestId(/^hand-[NESW]$/)
      .map((el) => el.getAttribute("data-testid"));
    expect(order).toEqual(["hand-N", "hand-W", "hand-E", "hand-S"]);

    const north = screen.getByTestId("hand-N");
    expect(north.textContent).toContain("North");
    expect(north.textContent).toContain("10 HCP");
    expect(north.textContent).toContain("A K 3 2");

    const south = screen.getByTestId("hand-S");
    expect(within(south).getByText(/\(you\)/)).toBeInTheDocument();
    expect(south.textContent).toContain("10 8 7 6");
  });

  it("states each side's points and fits", () => {
    render(<HandDiagram deal={MOCK_DEAL} />);
    // N-S: 10 + 13 = 23 HCP with 4+4 spades.
    expect(screen.getByTestId("side-NS").textContent).toBe(
      "N-S: 23 HCP8-card ♠ fit",
    );
    // E-W: 11 + 6 = 17 HCP, no eight-card suit.
    expect(screen.getByTestId("side-EW").textContent).toBe(
      "E-W: 17 HCPno 8-card fit",
    );
  });

  it("shows a void as a dash", () => {
    render(
      <HandDiagram
        deal={{
          north: { cards: [{ suit: "S", rank: "A" }] },
          east: { cards: [] },
          south: { cards: [] },
          west: { cards: [] },
        }}
      />,
    );
    expect(screen.getByTestId("hand-N").textContent).toContain("—");
  });
});
