import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HandDiagram } from "../HandDiagram";
import { MOCK_DEAL } from "../../bridge/mock";

describe("HandDiagram", () => {
  it("lays the hands out as cards: North, then West and East, then South", () => {
    render(<HandDiagram deal={MOCK_DEAL} userPosition="S" />);
    const order = screen
      .getAllByTestId(/^hand-[NESW]$/)
      .map((el) => el.getAttribute("data-testid"));
    expect(order).toEqual(["hand-N", "hand-W", "hand-E", "hand-S"]);

    for (const position of ["N", "E", "S", "W"]) {
      expect(
        within(screen.getByTestId(`hand-${position}`)).getAllByTestId(
          "mini-card",
        ),
      ).toHaveLength(13);
    }

    const north = screen.getByTestId("hand-N");
    expect(within(north).getByTestId("position-label-N")).toHaveTextContent(
      "North",
    );
    expect(north).toHaveTextContent("10 HCP");
    expect(within(north).queryByText(/\(you\)/)).toBeNull();

    const south = screen.getByTestId("hand-S");
    expect(within(south).getByText(/\(you\)/)).toBeInTheDocument();
    expect(south).toHaveTextContent("13 HCP");
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
});
