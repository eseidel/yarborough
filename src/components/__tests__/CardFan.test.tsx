import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { CardFan } from "../CardFan";
import { type Hand } from "../../bridge";
import { MOCK_DEAL } from "../../bridge/mock";

describe("CardFan", () => {
  const dummyHand: Hand = { cards: [] };

  it("renders the position label when provided", () => {
    render(<CardFan hand={dummyHand} position="N" />);
    expect(screen.getByText(/north/i)).toBeInTheDocument();
  });

  it("renders as a list when variant is 'list'", () => {
    render(<CardFan hand={dummyHand} position="W" variant="list" />);
    expect(screen.getByTestId("position-label-W")).toBeInTheDocument();
  });

  it("shows points and the user's marker only when asked", () => {
    const { rerender } = render(
      <CardFan hand={MOCK_DEAL.south} position="S" />,
    );
    expect(screen.queryByText(/HCP/)).toBeNull();
    expect(screen.queryByText(/\(you\)/)).toBeNull();

    rerender(<CardFan hand={MOCK_DEAL.south} position="S" showPoints isUser />);
    expect(screen.getByText("13 HCP")).toBeInTheDocument();
    expect(screen.getByTestId("position-label-S")).toHaveTextContent(
      /South\s*\(you\)/,
    );
  });

  it("overlaps every card but the last of a suit in a slot that can shrink", () => {
    render(<CardFan hand={MOCK_DEAL.north} position="N" variant="list" />);
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
});
