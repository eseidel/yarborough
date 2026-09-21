import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CallMenu } from "../CallMenu";
import type { CallInterpretation, HandAnalysis } from "../../bridge";

const INTERPRETATIONS: CallInterpretation[] = [
  { call: { type: "pass" }, ruleName: "Default Pass" },
  { call: { type: "bid", level: 1, strain: "H" }, ruleName: "One Level Suit" },
  { call: { type: "bid", level: 1, strain: "S" }, ruleName: "One Level Suit" },
  { call: { type: "bid", level: 1, strain: "N" } },
];

const ANALYSIS: HandAnalysis = {
  call: { type: "bid", level: 1, strain: "S" },
  calls: [
    { call: { type: "pass" }, fit: "possible" },
    {
      call: { type: "bid", level: 1, strain: "H" },
      fit: "unfit",
      unfitReason: { kind: "suit_short", suit: "H", shown: 5, actual: 2 },
    },
    { call: { type: "bid", level: 1, strain: "S" }, fit: "chosen" },
    {
      call: { type: "bid", level: 1, strain: "N" },
      fit: "unfit",
      unfitReason: { kind: "hcp_low", shown: 15, actual: 13 },
    },
  ],
};

describe("CallMenu", () => {
  it("says nothing about any hand without an analysis", () => {
    render(<CallMenu interpretations={INTERPRETATIONS} />);
    expect(screen.queryByText("SAYC bids this")).toBeNull();
    expect(screen.queryByText("Also fits")).toBeNull();
    expect(screen.queryByTestId("unfit-1H")).toBeNull();
  });

  it("marks the call SAYC makes", () => {
    render(<CallMenu interpretations={INTERPRETATIONS} analysis={ANALYSIS} />);
    const badges = screen.getAllByText("SAYC bids this");
    expect(badges).toHaveLength(1);
    // The badge sits on the 1S row and nowhere else.
    expect(badges[0].closest("div,button")).toHaveTextContent("1♠");
  });

  it("gives every call the hand cannot make its one reason", () => {
    render(<CallMenu interpretations={INTERPRETATIONS} analysis={ANALYSIS} />);
    expect(screen.getByTestId("unfit-1H")).toHaveTextContent(
      "Shows 5+ ♥, you have 2",
    );
    expect(screen.getByTestId("unfit-1N")).toHaveTextContent(
      "Shows 15+ points, you have 13",
    );
  });

  it("marks a call that fits but says less", () => {
    render(<CallMenu interpretations={INTERPRETATIONS} analysis={ANALYSIS} />);
    expect(screen.getAllByText("Also fits")).toHaveLength(1);
  });

  it("leaves every call selectable, fit or not", () => {
    const onSelect = vi.fn();
    render(
      <CallMenu
        interpretations={INTERPRETATIONS}
        analysis={ANALYSIS}
        onSelect={onSelect}
      />,
    );
    // Explore lets a player make any legal call and see where it leads,
    // including one the hand does not fit.
    fireEvent.click(screen.getByTestId("unfit-1H"));
    expect(onSelect).toHaveBeenCalledWith(INTERPRETATIONS[1]);
  });

  it("falls back to 'Not a SAYC call here' when nothing describes it", () => {
    render(<CallMenu interpretations={[{ call: { type: "double" } }]} />);
    expect(screen.getByText("Not a SAYC call here")).toBeInTheDocument();
  });
});
