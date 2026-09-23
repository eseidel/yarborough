import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { ExplorePage } from "../ExplorePage";
import * as engine from "../../bridge/engine";
import {
  type CallInterpretation,
  type HandAnalysis,
  handFromCdhsString,
} from "../../bridge";
import { HANDS_KEY, loadHands, saveHands } from "../../bridge/entered-hands";

vi.mock("../../bridge/engine", () => ({
  getCallInterpretations: vi.fn(),
  getHandAnalysis: vi.fn(),
}));

const PASS = { type: "pass" } as const;
const ONE_HEART = { type: "bid", level: 1, strain: "H" } as const;
const ONE_SPADE = { type: "bid", level: 1, strain: "S" } as const;

/** ♠AQ982 ♥K5 ♦A973 ♣42: 13 hcp, opens 1♠. */
const NORTH = handFromCdhsString("42.A973.K5.AQ982")!;
const SOUTH = handFromCdhsString("963.A52.Q83.KJ74")!;

const INTERPRETATIONS: CallInterpretation[] = [
  { call: PASS, ruleName: "Pass" },
  { call: ONE_HEART, ruleName: "One Level Opening", constraints: "5+ ♥" },
  { call: ONE_SPADE, ruleName: "One Level Opening", constraints: "5+ ♠" },
];

const ANALYSIS: HandAnalysis = {
  call: ONE_SPADE,
  calls: [
    {
      ...INTERPRETATIONS[0],
      fit: "possible",
      misses: [],
      preference: {
        kind: "purpose",
        over: ONE_SPADE,
        purpose: "Forced",
        overPurpose: "MajorDiscovery",
      },
    },
    {
      ...INTERPRETATIONS[1],
      fit: "unfit",
      misses: [{ kind: "length", suit: "H", min: 5, max: 13, actual: 2 }],
    },
    { ...INTERPRETATIONS[2], fit: "chosen", misses: [] },
  ],
};

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: "/explore/:exploreId", element: <ExplorePage /> },
      { path: "/explore", element: <ExplorePage /> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

async function menuLoaded() {
  await screen.findByTestId("call-row-1S");
}

describe("ExplorePage", () => {
  beforeEach(() => {
    vi.mocked(engine.getCallInterpretations).mockResolvedValue(INTERPRETATIONS);
    vi.mocked(engine.getHandAnalysis).mockResolvedValue(ANALYSIS);
  });
  afterEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("names the board's dealer and vulnerability", async () => {
    renderAt("/explore/2");
    await menuLoaded();
    expect(screen.getByText("East deals · N-S vul")).toBeTruthy();
    expect(screen.getByLabelText("Board number")).toHaveValue("2");
  });

  it("invites the seat to call to enter its hand", async () => {
    renderAt("/explore/1");
    await menuLoaded();
    expect(
      screen.getByRole("button", { name: /Enter North's hand/ }),
    ).toBeTruthy();
    expect(engine.getHandAnalysis).not.toHaveBeenCalled();
  });

  it("keeps an entered hand face down, and its verdicts hidden, until shown", async () => {
    saveHands({ N: NORTH });
    renderAt("/explore/1");
    await menuLoaded();
    await waitFor(() =>
      expect(engine.getHandAnalysis).toHaveBeenCalledWith(
        NORTH,
        "",
        "N",
        "None",
      ),
    );
    expect(screen.queryAllByTestId("mini-card")).toHaveLength(0);
    expect(screen.getByTestId("call-row-1S").dataset.fit).toBeUndefined();
    expect(screen.queryByText("SAYC")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show North's hand" }));
    expect(screen.getAllByTestId("mini-card")).toHaveLength(13);
    // SAYC's call is marked where it stands, among the others.
    const rows = screen.getAllByTestId(/^call-row-/);
    expect(rows.map((row) => row.dataset.fit)).toEqual([
      "possible",
      "unfit",
      "chosen",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryAllByTestId("mini-card")).toHaveLength(0);
    expect(screen.queryByText("SAYC")).toBeNull();
  });

  it("turns the hand face down again once a call is made", async () => {
    saveHands({ N: NORTH, E: SOUTH });
    const router = renderAt("/explore/1");
    await menuLoaded();
    fireEvent.click(screen.getByRole("button", { name: "Show North's hand" }));
    fireEvent.click(screen.getByTestId("call-row-1S"));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/explore/1:1S"),
    );
    // East's hand is next, and it starts face down.
    expect(
      await screen.findByRole("button", { name: "Show East's hand" }),
    ).toBeTruthy();
    expect(screen.queryAllByTestId("mini-card")).toHaveLength(0);

    await act(async () => {
      router.navigate(-1);
    });
    expect(
      await screen.findByRole("button", { name: "Show North's hand" }),
    ).toBeTruthy();
  });

  it("restarts the auction on the same board, keeping the hands", async () => {
    saveHands({ N: NORTH });
    const router = renderAt("/explore/5:1S,P");
    await menuLoaded();
    fireEvent.click(screen.getByRole("button", { name: "Restart this board" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/explore/5"),
    );
    expect(loadHands()).toEqual({ N: NORTH });
    expect(
      screen.getByRole("button", { name: "Restart this board" }),
    ).toBeDisabled();
    expect(
      await screen.findByRole("button", { name: "Show North's hand" }),
    ).toBeTruthy();
  });

  it("forgets the hands on the next board", async () => {
    saveHands({ N: NORTH, S: SOUTH });
    const router = renderAt("/explore/5:1S");
    await menuLoaded();
    fireEvent.click(screen.getByRole("button", { name: /Next board/ }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/explore/6"),
    );
    expect(sessionStorage.getItem(HANDS_KEY)).toBeNull();
    expect(
      await screen.findByRole("button", { name: /Enter East's hand/ }),
    ).toBeTruthy();
  });

  it("wraps from the last board of the session to the first", async () => {
    const router = renderAt("/explore/36");
    await menuLoaded();
    fireEvent.click(screen.getByRole("button", { name: /Next board/ }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/explore/1"),
    );
  });

  it("picks another board number, keeping the hands", async () => {
    saveHands({ N: NORTH });
    const router = renderAt("/explore/1:1S");
    await menuLoaded();
    fireEvent.change(screen.getByLabelText("Board number"), {
      target: { value: "9" },
    });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/explore/9"),
    );
    expect(loadHands()).toEqual({ N: NORTH });
    expect(screen.getByText("North deals · E-W vul")).toBeTruthy();
  });

  it("enters a hand, shows it, and keeps it for the tab", async () => {
    renderAt("/explore/1");
    await menuLoaded();
    fireEvent.click(screen.getByRole("button", { name: /Enter North's hand/ }));
    const sheet = await screen.findByTestId("hand-entry");
    const tap = (name: string) =>
      fireEvent.click(within(sheet).getByRole("button", { name }));
    tap("A of spades");
    tap("Q of spades");
    tap("3 small cards");
    tap("K of hearts");
    tap("1 small card");
    tap("A of diamonds");
    tap("3 small cards");
    tap("2 small cards");
    tap("Done");
    await waitFor(() => expect(screen.queryByTestId("hand-entry")).toBeNull(), {
      timeout: 3000,
    });
    // The player who entered it is looking at it.
    expect(screen.getAllByTestId("mini-card")).toHaveLength(13);
    expect(sessionStorage.getItem(HANDS_KEY)).toBe("N=32.A432.K2.AQ432");
    await waitFor(() =>
      expect(screen.getByTestId("call-row-1S").dataset.fit).toBe("chosen"),
    );
  });

  it("keeps an unfinished entry for the seat when the sheet is dismissed", async () => {
    renderAt("/explore/1");
    await menuLoaded();
    fireEvent.click(screen.getByRole("button", { name: /Enter North's hand/ }));
    let sheet = await screen.findByTestId("hand-entry");
    fireEvent.click(within(sheet).getByRole("button", { name: "K of spades" }));
    fireEvent.click(screen.getByTestId("sheet-scrim"));
    await waitFor(() => expect(screen.queryByTestId("hand-entry")).toBeNull());
    expect(sessionStorage.getItem(HANDS_KEY)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Enter North's hand/ }));
    sheet = await screen.findByTestId("hand-entry");
    expect(
      within(sheet).getByRole("button", { name: "K of spades" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("forgets a hand from its edit sheet", async () => {
    saveHands({ N: NORTH });
    renderAt("/explore/1");
    await menuLoaded();
    fireEvent.click(screen.getByRole("button", { name: "Show North's hand" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const sheet = await screen.findByTestId("hand-entry");
    fireEvent.click(within(sheet).getByRole("button", { name: "Forget" }));
    expect(
      await screen.findByRole("button", { name: /Enter North's hand/ }),
    ).toBeTruthy();
    expect(sessionStorage.getItem(HANDS_KEY)).toBeNull();
  });

  it("shows the contract in place of the calls once the auction ends", async () => {
    saveHands({ N: NORTH });
    renderAt("/explore/1:1S,P,P,P");
    const result = await screen.findByTestId("explore-result");
    expect(result.textContent).toContain("Contract");
    expect(result.textContent).toContain("1♠");
    expect(result.textContent).toContain("by North");
    expect(screen.queryByTestId("call-row-1S")).toBeNull();
    expect(engine.getHandAnalysis).not.toHaveBeenCalled();
  });

  it("says when a board was passed out", async () => {
    renderAt("/explore/1:P,P,P,P");
    const result = await screen.findByTestId("explore-result");
    expect(result.textContent).toContain("Passed out");
  });
});
