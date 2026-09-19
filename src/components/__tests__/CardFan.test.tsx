import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { CardFan } from "../CardFan";
import { type Hand } from "../../bridge";
import { MOCK_DEAL, MOCK_VOID_DEAL } from "../../bridge/mock";

describe("CardFan", () => {
  const dummyHand: Hand = { cards: [] };

  it("renders the position label when provided", () => {
    render(<CardFan hand={dummyHand} position="N" />);
    expect(screen.getByText(/north/i)).toBeInTheDocument();
  });

  it("fans all thirteen cards", () => {
    render(<CardFan hand={MOCK_DEAL.south} position="S" />);
    expect(
      within(screen.getByTestId("hand-S")).getAllByTestId("mini-card"),
    ).toHaveLength(13);
  });

  it("overlaps every card but the last of a suit in a slot that can shrink", () => {
    render(<CardFan hand={MOCK_DEAL.north} position="N" />);
    const cards = within(screen.getByTestId("hand-N")).getAllByTestId(
      "mini-card",
    );
    expect(cards).toHaveLength(13);
    // Spades: A K 3 2. The first three sit in shrinkable slots; the last
    // keeps its full width so the suit's rightmost card is always whole.
    const slots = cards.slice(0, 4).map((card) => card.parentElement!);
    expect(slots[0].className).toContain("max-w-5");
    expect(slots[2].className).toContain("max-w-5");
    expect(slots[3].className).toContain("shrink-0");
    expect(slots[3].className).not.toContain("max-w-5");
  });

  it("drops void suits, which a wrapped fan has nothing to line up with", () => {
    render(<CardFan hand={MOCK_VOID_DEAL.west} position="N" />);
    expect(screen.getByTestId("suit-rows").children).toHaveLength(3);
  });
});
