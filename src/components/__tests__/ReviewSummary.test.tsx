import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReviewSummary } from "../ReviewSummary";
import type { CallHistory } from "../../bridge/types";
import type { CallVerdict } from "../../practice/verdicts";
import * as engine from "../../bridge/engine";

vi.mock("../../bridge/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../bridge/engine")>();
  return { ...actual, getCallInterpretations: vi.fn() };
});

// Dealer North: N 1♥, E P, S 2♥, W P, N 3♥, E P, S P, W P. South called twice.
const HISTORY: CallHistory = {
  dealer: "N",
  calls: [
    { type: "bid", level: 1, strain: "H" },
    { type: "pass" },
    { type: "bid", level: 2, strain: "H" },
    { type: "pass" },
    { type: "bid", level: 3, strain: "H" },
    { type: "pass" },
    { type: "pass" },
    { type: "pass" },
  ],
};

const SAYC_AUCTION: CallHistory = {
  dealer: "N",
  calls: [
    { type: "bid", level: 1, strain: "H" },
    { type: "pass" },
    { type: "bid", level: 4, strain: "H" },
    { type: "pass" },
    { type: "pass" },
    { type: "pass" },
  ],
};

const RAISE_MISS: CallVerdict = {
  index: 2,
  call: { type: "bid", level: 2, strain: "H" },
  sayc: {
    call: { type: "bid", level: 4, strain: "H" },
    ruleName: "Jump Raise",
    constraints: "13-16 hcp, 4+H",
    description: "Game raise",
  },
  matched: false,
  assisted: false,
};
const FINAL_PASS: CallVerdict = {
  index: 6,
  call: { type: "pass" },
  sayc: { call: { type: "pass" } },
  matched: true,
  assisted: false,
};

describe("ReviewSummary", () => {
  it("shows the contract and waits for every call to be checked", () => {
    render(
      <ReviewSummary
        history={HISTORY}
        verdicts={[RAISE_MISS]}
        userPosition="S"
        saycAuction={SAYC_AUCTION}
        vulnerability="None"
      />,
    );
    expect(screen.getByTestId("contract").textContent).toBe("3♥ by North");
    expect(screen.getByTestId("verdict-pending")).toBeInTheDocument();
    expect(screen.queryByTestId("sayc-auction")).toBeNull();
  });

  it("praises a hand bid on system and notes help", () => {
    const { rerender } = render(
      <ReviewSummary
        history={HISTORY}
        verdicts={[{ ...RAISE_MISS, matched: true }, FINAL_PASS]}
        userPosition="S"
        saycAuction={SAYC_AUCTION}
        vulnerability="None"
      />,
    );
    expect(screen.getByTestId("verdict-on-system").textContent).toBe(
      "✓ All 2 of your calls followed SAYC",
    );
    expect(screen.queryByTestId("sayc-auction")).toBeNull();

    rerender(
      <ReviewSummary
        history={HISTORY}
        verdicts={[
          { ...RAISE_MISS, matched: true, assisted: true },
          FINAL_PASS,
        ]}
        userPosition="S"
        saycAuction={SAYC_AUCTION}
        vulnerability="None"
      />,
    );
    expect(screen.getByTestId("verdict-on-system").textContent).toContain(
      "(1 after seeing the SAYC bid)",
    );
  });

  it("lists each call that differed, with the rule behind SAYC's call", () => {
    const onShowOptions = vi.fn();
    render(
      <ReviewSummary
        history={HISTORY}
        verdicts={[RAISE_MISS, FINAL_PASS]}
        userPosition="S"
        saycAuction={SAYC_AUCTION}
        vulnerability="None"
        onShowOptions={onShowOptions}
      />,
    );
    expect(screen.getByTestId("verdict-missed").textContent).toBe(
      "1 of your 2 calls differed from SAYC",
    );
    const missed = screen.getByTestId("missed-call");
    expect(missed.textContent).toContain(
      "You bid 2♥. SAYC bids 4♥: Jump Raise.",
    );
    expect(screen.queryByText("Game raise")).toBeNull();
    fireEvent.click(within(missed).getByRole("button", { name: "Why?" }));
    expect(screen.getByText("Game raise")).toBeInTheDocument();
    expect(missed.textContent).toContain("13-16 hcp, 4+");

    fireEvent.click(
      within(missed).getByRole("button", { name: "All options here" }),
    );
    expect(onShowOptions).toHaveBeenCalledWith(HISTORY, 2);
  });

  it("shows where SAYC's own auction ends and explains its calls on tap", async () => {
    vi.mocked(engine.getCallInterpretations).mockResolvedValue([
      {
        call: { type: "bid", level: 1, strain: "H" },
        ruleName: "One Level Suit Opening",
        description: "12-21 HCP, 5+ hearts",
      },
    ]);
    render(
      <ReviewSummary
        history={HISTORY}
        verdicts={[RAISE_MISS, FINAL_PASS]}
        userPosition="S"
        saycAuction={SAYC_AUCTION}
        vulnerability="NS"
      />,
    );
    const auction = screen.getByTestId("sayc-auction");
    expect(auction.textContent).toContain("SAYC reaches 4♥ by North");
    expect(screen.queryByTestId("sayc-auction-table")).toBeNull();

    fireEvent.click(screen.getByTestId("sayc-auction-toggle"));
    const table = screen.getByTestId("sayc-auction-table");
    fireEvent.click(within(table).getByTestId("call-0"));
    await waitFor(() => {
      expect(screen.getByText("One Level Suit Opening")).toBeInTheDocument();
    });
    expect(engine.getCallInterpretations).toHaveBeenCalledWith("", "N", "NS");
  });

  it("names a passed-out board", () => {
    const passOut: CallHistory = {
      dealer: "N",
      calls: [
        { type: "pass" },
        { type: "pass" },
        { type: "pass" },
        { type: "pass" },
      ],
    };
    render(
      <ReviewSummary
        history={passOut}
        verdicts={[
          {
            index: 2,
            call: { type: "pass" },
            sayc: { call: { type: "pass" } },
            matched: true,
            assisted: false,
          },
        ]}
        userPosition="S"
        saycAuction={passOut}
        vulnerability="None"
      />,
    );
    expect(screen.getByTestId("contract").textContent).toBe("Passed out");
    expect(screen.getByTestId("verdict-on-system").textContent).toBe(
      "✓ Your call followed SAYC",
    );
  });
});
