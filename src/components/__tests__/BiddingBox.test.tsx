import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BiddingBox } from "../BiddingBox";
import { type CallHistory } from "../../bridge";

describe("BiddingBox", () => {
  const emptyHistory: CallHistory = { dealer: "N", calls: [] };

  it("renders buttons in the correct order: Redouble, Pass, Double", () => {
    render(<BiddingBox onBid={() => { }} callHistory={emptyHistory} />);

    const buttons = screen.getAllByRole("button");
    // The first three buttons should be Double (X), Pass, Redouble (XX)
    // Actually, in the current implementation, some might be disabled or not rendered?
    // Let's check the code again.
    // It renders Pass, then Double, then Redouble.
    // Double and Redouble are always rendered but might be disabled.

    const topRowButtons = buttons.slice(0, 3);
    const buttonTexts = topRowButtons.map(b => b.textContent?.trim());

    expect(buttonTexts[0]).toBe("XX");
    expect(buttonTexts[1]).toBe("Pass");
    expect(buttonTexts[2]).toBe("X");
  });
});
