import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SaycHint } from "../SaycHint";

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
});
