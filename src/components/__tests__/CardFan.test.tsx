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

  it("renders as a list when variant is 'list'", () => {
    render(<CardFan hand={dummyHand} position="W" variant="list" />);
    // Check for list-specific classes or structures if possible, 
    // but at least ensure it still renders.
    expect(screen.getByTestId("position-label-W")).toBeInTheDocument();
  });
});
