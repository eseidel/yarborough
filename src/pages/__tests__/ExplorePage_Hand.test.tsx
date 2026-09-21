import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { ExplorePage } from "../ExplorePage";
import * as engine from "../../bridge/engine";
import { handFromCdhsString } from "../../bridge/types";
import { saveHands } from "../../bridge/entered-hands";

vi.mock("../../bridge/engine", () => ({
  getCallInterpretations: vi.fn(),
  getHandAnalysis: vi.fn(),
}));

const OPENER = "42.A973.K5.AQ982";

/** The thirteen cards of OPENER, in the order the grid is tapped. */
const OPENER_KEYS = [
  "SA",
  "SQ",
  "S9",
  "S8",
  "S2",
  "HK",
  "H5",
  "DA",
  "D9",
  "D7",
  "D3",
  "C4",
  "C2",
];

function renderExplore(at = "/explore/1") {
  const router = createMemoryRouter(
    [
      { path: "/explore/:exploreId", element: <ExplorePage /> },
      { path: "/explore", element: <ExplorePage /> },
    ],
    { initialEntries: [at] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

function tap(card: string) {
  const cell = document.querySelector(`[data-card="${card}"]`)!;
  fireEvent.pointerDown(cell, { clientX: 0, clientY: 0, pointerId: 1 });
  fireEvent.pointerUp(cell, { clientX: 0, clientY: 0, pointerId: 1 });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(engine.getCallInterpretations).mockResolvedValue([
    {
      call: { type: "pass" },
      ruleName: "Default Pass",
      description: "Not enough for an opening bid",
    },
  ]);
  vi.mocked(engine.getHandAnalysis).mockResolvedValue({
    call: { type: "bid", level: 1, strain: "S" },
    category: ["Opening", "One of a suit", "One Level Suit Opening"],
    calls: [
      {
        call: { type: "bid", level: 1, strain: "S" },
        ruleName: "One Level Suit Opening",
        constraints: "12-21 hcp, 5+S",
        description: "Opening bid with 5+ spades",
        fit: "chosen",
      },
    ],
  });
});

afterEach(() => {
  window.sessionStorage.clear();
});

describe("the hand of the seat to call", () => {
  it("shows nothing about any hand until someone asks", async () => {
    renderExplore();
    await waitFor(() => screen.getByTestId("hand-slot"));
    // The phone goes round a table, so a seat picking it up out of turn sees
    // the auction and an invitation, and no cards at all.
    expect(screen.getByTestId("hand-slot")).toHaveTextContent(
      "Enter North's hand",
    );
    expect(screen.queryByTestId("hand-entry")).toBeNull();
    expect(document.querySelectorAll("[data-card]")).toHaveLength(0);
    expect(document.querySelectorAll('[data-testid="mini-card"]')).toHaveLength(
      0,
    );
  });

  it("opens the entry only when the slot is tapped", async () => {
    renderExplore();
    await waitFor(() => screen.getByTestId("hand-slot"));
    fireEvent.click(screen.getByTestId("hand-slot"));
    expect(screen.getByTestId("hand-entry")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-card]")).toHaveLength(52);
  });

  it("closes the entry on the thirteenth card and shows the hand", async () => {
    renderExplore();
    await waitFor(() => screen.getByTestId("hand-slot"));
    fireEvent.click(screen.getByTestId("hand-slot"));
    for (const key of OPENER_KEYS) tap(key);
    expect(screen.queryByTestId("hand-entry")).toBeNull();
    expect(screen.getAllByTestId("mini-card")).toHaveLength(13);
  });

  it("keeps the recommendation behind a second, deliberate tap", async () => {
    saveHands(1, { N: handFromCdhsString(OPENER)! });
    renderExplore();
    await waitFor(() => screen.getByTestId("hand-slot"));

    // Closed: the hand is known, and still not on screen.
    expect(screen.getByTestId("hand-slot")).toHaveTextContent(
      "Show North's hand",
    );
    expect(screen.queryAllByTestId("mini-card")).toHaveLength(0);
    expect(engine.getHandAnalysis).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("hand-slot"));
    expect(screen.getAllByTestId("mini-card")).toHaveLength(13);
    // Seeing the cards is not asking what to bid with them.
    expect(engine.getHandAnalysis).not.toHaveBeenCalled();
    expect(screen.queryByTestId("suggested-call")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "What should I bid?" }));
    await waitFor(() => screen.getByTestId("suggested-call"));
    expect(screen.getByTestId("suggested-call")).toHaveTextContent("1♠");
    expect(screen.getByTestId("suggested-call")).toHaveTextContent(
      "One Level Suit Opening",
    );
  });

  it("asks the engine about that seat's hand and no other", async () => {
    saveHands(1, { N: handFromCdhsString(OPENER)! });
    renderExplore();
    await waitFor(() => screen.getByTestId("hand-slot"));
    fireEvent.click(screen.getByTestId("hand-slot"));
    fireEvent.click(screen.getByRole("button", { name: "What should I bid?" }));
    await waitFor(() => expect(engine.getHandAnalysis).toHaveBeenCalled());
    const [hand, calls, dealer] = vi.mocked(engine.getHandAnalysis).mock
      .calls[0];
    expect(hand.cards).toHaveLength(13);
    expect(calls).toBe("");
    expect(dealer).toBe("N");
  });

  it("folds everything away again when a call is made", async () => {
    saveHands(1, { N: handFromCdhsString(OPENER)! });
    const router = renderExplore();
    await waitFor(() => screen.getByTestId("hand-slot"));
    fireEvent.click(screen.getByTestId("hand-slot"));
    expect(screen.getAllByTestId("mini-card")).toHaveLength(13);

    // North passes, and the phone goes to East.
    fireEvent.click(screen.getByText("Default Pass"));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/explore/1:P"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("hand-slot")).toHaveTextContent(
        "Enter East's hand",
      ),
    );
    expect(screen.queryAllByTestId("mini-card")).toHaveLength(0);
  });

  it("brings a seat's own hand back when the auction returns to it", async () => {
    saveHands(1, { N: handFromCdhsString(OPENER)! });
    // Four calls on it is North's turn again, and the auction is still live.
    renderExplore("/explore/1:1C,P,1H,P");
    await waitFor(() =>
      expect(screen.getByTestId("hand-slot")).toHaveTextContent(
        "Show North's hand",
      ),
    );
  });
});
