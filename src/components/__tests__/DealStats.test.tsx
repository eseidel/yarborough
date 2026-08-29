import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DealStats } from "../DealStats";
import type { Deal } from "../../bridge";

describe("DealStats", () => {
  const mockDeal: Deal = {
    north: {
      cards: [
        { suit: "S", rank: "A" }, // 4 HCP
        { suit: "S", rank: "K" }, // 3 HCP
        { suit: "H", rank: "Q" }, // 2 HCP
        { suit: "D", rank: "J" }, // 1 HCP
        { suit: "C", rank: "T" },
      ],
    },
    south: {
      cards: [
        { suit: "S", rank: "Q" }, // 2 HCP
        { suit: "H", rank: "A" }, // 4 HCP
        { suit: "D", rank: "K" }, // 3 HCP
        { suit: "C", rank: "A" }, // 4 HCP
      ],
    },
    east: {
      cards: [
        { suit: "S", rank: "2" },
        { suit: "H", rank: "2" },
        { suit: "D", rank: "2" },
        { suit: "C", rank: "K" }, // 3 HCP
      ],
    },
    west: {
      cards: [
        { suit: "S", rank: "3" },
        { suit: "H", rank: "3" },
        { suit: "D", rank: "3" },
        { suit: "C", rank: "Q" }, // 2 HCP
      ],
    },
  };

  it("calculates and displays HCP for both partnerships", () => {
    render(<DealStats deal={mockDeal} />);

    // North (10) + South (13) = 23 HCP
    const nsEl = screen.getByTestId("deal-stats-ns");
    expect(nsEl).toHaveTextContent("N-S: 23 HCP");

    // East (3) + West (2) = 5 HCP
    const ewEl = screen.getByTestId("deal-stats-ew");
    expect(ewEl).toHaveTextContent("E-W: 5 HCP");
  });

  it("calculates combined suit counts for both partnerships", () => {
    render(<DealStats deal={mockDeal} />);

    // N-S Spades: 2 (North) + 1 (South) = 3
    const nsEl = screen.getByTestId("deal-stats-ns");
    expect(nsEl).toHaveTextContent("3"); // 3 spades
  });
});
