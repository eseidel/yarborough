import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { CardFan } from "../CardFan";
import { type Hand } from "../../bridge";

describe("CardFan", () => {
  const dummyHand: Hand = { cards: [] };

  it("renders the position label when provided", () => {
    render(<CardFan hand={dummyHand} position="N" />);
    expect(screen.getByText(/north/i)).toBeInTheDocument();
  });

  it("does not render a label when position is omitted", () => {
    render(<CardFan hand={dummyHand} />);
    expect(screen.queryByText(/north/i)).not.toBeInTheDocument();
  });
});
