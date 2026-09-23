import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SaycHint } from "../SaycHint";
import { handFromCdhsString } from "../../bridge/types";

describe("SaycHint", () => {
  it("shows the engine's call with its rule and bids it on tap", () => {
    const onBid = vi.fn();
    render(
      <SaycHint
        suggestion={{
          call: { type: "bid", level: 2, strain: "D" },
          ruleName: "Jacoby Transfer To Hearts",
          constraints: "5+H",
          description: "Transfer to hearts",
        }}
        onBid={onBid}
      />,
    );
    const hint = screen.getByTestId("sayc-hint");
    expect(hint.textContent).toContain(
      "SAYC bids 2♦: Jacoby Transfer To Hearts",
    );
    expect(hint.textContent).toContain("Transfer to hearts");
    expect(hint.textContent).toContain("will not count");
    fireEvent.click(screen.getByRole("button", { name: /Bid 2\s*♦/ }));
    expect(onBid).toHaveBeenCalledWith({ type: "bid", level: 2, strain: "D" });
  });

  it("waits for the engine", () => {
    render(<SaycHint suggestion={null} onBid={() => {}} />);
    expect(screen.getByTestId("sayc-hint-loading")).toBeInTheDocument();
  });

  it("explains the call in full against the user's hand", () => {
    // ♠KQ82 ♥A5 ♦A973 ♣K42: sixteen points, balanced.
    const hand = handFromCdhsString("K42.A973.A5.KQ82")!;
    render(
      <SaycHint
        suggestion={{
          call: { type: "bid", level: 1, strain: "N" },
          ruleName: "Notrump Opening",
        }}
        hand={hand}
        analysis={{
          call: { type: "bid", level: 1, strain: "N" },
          calls: [
            {
              call: { type: "bid", level: 1, strain: "D" },
              fit: "possible",
              misses: [],
              preference: {
                kind: "purpose",
                over: { type: "bid", level: 1, strain: "N" },
                purpose: "MinorDiscovery",
                overPurpose: "EnterNotrumpSystem",
              },
            },
            {
              call: { type: "bid", level: 1, strain: "N" },
              fit: "chosen",
              misses: [],
            },
          ],
        }}
        onBid={() => {}}
      />,
    );
    expect(screen.getByTestId("hand-reasons")).toHaveTextContent(
      "You have 16 hcp and a balanced hand." +
        "Why not 1♦? SAYC prefers 1NT: showing a balanced hand in a notrump range comes before showing a minor you may fit.",
    );
  });
});
