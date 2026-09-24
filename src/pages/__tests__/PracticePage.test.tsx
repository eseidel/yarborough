import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PracticePage } from "../PracticePage";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type {
  Call,
  CallHistory,
  CallInterpretation,
  HandAnalysis,
} from "../../bridge/types";
import { handFromCdhsString } from "../../bridge/types";
import { HANDS_KEY } from "../../bridge/entered-hands";
import { clearHandAnalysisCache } from "../../practice/useHandAnalysis";
import * as auction from "../../bridge/auction";
import * as identifier from "../../bridge/identifier";
import * as engine from "../../bridge/engine";
import * as dds from "../../dds/dds";
import {
  type RecordStore,
  openRecordStore,
  useRecordStoreForTests,
} from "../../practice/record/db";

vi.mock("../../bridge/auction", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../bridge/auction")>();
  return {
    ...actual,
    addRobotBids: vi.fn(),
    getFullAutobidAuction: vi.fn(),
  };
});

vi.mock("../../bridge/identifier", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../bridge/identifier")>();
  return {
    ...actual,
    parseBoardId: vi.fn(),
  };
});

vi.mock("../../bridge/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../bridge/engine")>();
  return {
    ...actual,
    getSuggestedCall: vi.fn(),
    getCallInterpretations: vi.fn(),
    generateFilteredBoard: vi.fn(),
    getOpeningLead: vi.fn(),
    generateAdaptiveBoard: vi.fn(),
    getHandAnalysis: vi.fn(),
  };
});

vi.mock("../../dds/dds", () => ({
  getDoubleDummyTable: vi.fn(),
  getTricksAfterLead: vi.fn(),
}));

const mockAddRobotBids = vi.mocked(auction.addRobotBids);
const mockGetFullAutobidAuction = vi.mocked(auction.getFullAutobidAuction);
const mockParseBoardId = vi.mocked(identifier.parseBoardId);
const mockGetSuggestedCall = vi.mocked(engine.getSuggestedCall);
const mockGetCallInterpretations = vi.mocked(engine.getCallInterpretations);
const mockGenerateFilteredBoard = vi.mocked(engine.generateFilteredBoard);
const mockGetOpeningLead = vi.mocked(engine.getOpeningLead);
const mockGenerateAdaptiveBoard = vi.mocked(engine.generateAdaptiveBoard);
const mockGetHandAnalysis = vi.mocked(engine.getHandAnalysis);
const mockGetDoubleDummyTable = vi.mocked(dds.getDoubleDummyTable);
const mockGetTricksAfterLead = vi.mocked(dds.getTricksAfterLead);

const boardId = "1-00000000000000000000000000";
const bid = (level: number, strain: "C" | "D" | "H" | "S" | "N"): Call => ({
  type: "bid",
  level,
  strain,
});
const pass: Call = { type: "pass" };

// Dealer North. The robots open 1♠ and East passes; South is to call.
const OPENING: CallHistory = { dealer: "N", calls: [bid(1, "S"), pass] };
// ...and a completed auction, 4♠ by North, in which South called twice.
const COMPLETE: CallHistory = {
  dealer: "N",
  calls: [bid(1, "S"), pass, bid(3, "S"), pass, bid(4, "S"), pass, pass, pass],
};

const TABLE = Object.fromEntries(
  (["S", "H", "D", "C", "N"] as const).map((strain) => [
    strain,
    { N: 10, E: 3, S: 10, W: 3 },
  ]),
) as Record<"S" | "H" | "D" | "C" | "N", Record<"N" | "E" | "S" | "W", number>>;

const dummyParsed = {
  boardNumber: 1,
  deal: {
    north: { cards: [] },
    east: { cards: [] },
    south: { cards: [] },
    west: { cards: [] },
  },
  dealer: "N" as const,
  vulnerability: "None" as const,
  initialCalls: [] as Call[],
};

/** The engine's call at each of South's turns, by the auction before it. */
const SAYC_CALLS: Record<string, Call> = {
  "1S,P": bid(3, "S"),
  "1S,P,3S,P,4S,P": pass,
};

// ♠KJ74 ♥Q83 ♦A52 ♣963: ten points and four spades, over partner's 1♠.
const SOUTH = handFromCdhsString("963.A52.Q83.KJ74")!;
const withSouth = {
  ...dummyParsed,
  deal: { ...dummyParsed.deal, south: SOUTH },
};

/** South's hand weighed over 1♠: SAYC jumps to 3♠, 2♠ is short of points. */
const SOUTH_ANALYSIS: HandAnalysis = {
  call: bid(3, "S"),
  calls: [
    { call: pass, fit: "unfit", misses: [] },
    {
      call: bid(1, "N"),
      ruleName: "One Notrump Response",
      fit: "possible",
      misses: [],
      preference: {
        kind: "purpose",
        over: bid(3, "S"),
        purpose: "BalancedLimit",
        overPurpose: "SupportMajors",
      },
    },
    {
      call: bid(2, "S"),
      ruleName: "Simple Raise",
      fit: "unfit",
      misses: [
        { kind: "points", min: 6, max: 9, actual: 10, withShape: false },
      ],
    },
    { call: bid(3, "S"), ruleName: "Jump Raise", fit: "chosen", misses: [] },
  ],
};

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location-path">{location.pathname}</div>;
}

function renderPage(path = `/bid/${boardId}`, state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <Routes>
        <Route
          path="/bid/:boardId"
          element={
            <>
              <PracticePage />
              <LocationDisplay />
            </>
          }
        />
        <Route path="/explore/:exploreId" element={<LocationDisplay />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Tap a call in the bidding box. */
const callFromBox = (label: string) =>
  fireEvent.click(
    within(screen.getByTestId("bidding-box"))
      .getAllByRole("button")
      .find((b) => b.textContent === label)!,
  );

const waitForRobots = () =>
  waitFor(() =>
    expect(screen.getByTestId("bidding-box")).not.toHaveAttribute(
      "aria-disabled",
      "true",
    ),
  );

describe("PracticePage", () => {
  let store: RecordStore;

  beforeEach(async () => {
    vi.clearAllMocks();
    store = await openRecordStore(new IDBFactory(), "practice-page");
    useRecordStoreForTests(Promise.resolve(store));
    mockParseBoardId.mockReturnValue(dummyParsed);
    mockAddRobotBids.mockResolvedValue(OPENING);
    mockGetFullAutobidAuction.mockResolvedValue(COMPLETE);
    mockGetSuggestedCall.mockImplementation(async (id) => {
      const key = id.split(":")[1] ?? "";
      return {
        call: SAYC_CALLS[key] ?? pass,
        ruleName: key === "1S,P" ? "Jump Raise" : undefined,
        constraints: key === "1S,P" ? "10-12 hcp, 4+S" : undefined,
      };
    });
    mockGetCallInterpretations.mockResolvedValue([
      { call: bid(3, "S"), ruleName: "Jump Raise" },
      { call: bid(2, "S"), ruleName: "Simple Raise" },
      { call: pass },
    ]);
    mockGetDoubleDummyTable.mockResolvedValue(TABLE);
    mockGetOpeningLead.mockResolvedValue({
      leader: "E",
      card: { suit: "D", rank: "4" },
      reason: "fourth best",
      partnerSuits: [],
      theirSuits: [],
    });
    mockGetTricksAfterLead.mockResolvedValue(11);
    mockGenerateAdaptiveBoard.mockResolvedValue(null);
    mockGetHandAnalysis.mockResolvedValue(SOUTH_ANALYSIS);
    clearHandAnalysisCache();
    window.sessionStorage.clear();
  });

  /** A record with one clear weak spot: responses to 1NT. */
  async function recordWithWeakSpot() {
    for (let i = 0; i < 10; i++) {
      await store.addHand({
        boardId: `${(i % 16) + 1}-11111111111111111111111111`,
        boardNumber: (i % 16) + 1,
        dealer: "N",
        vulnerability: "None",
        userPosition: "S",
        source: "Random",
        calls: ["1N", "P", "P", "P"],
        contract: "1N",
        declarer: "N",
        saycCalls: null,
        verdicts: [
          {
            index: 2,
            call: "P",
            saycCall: "2C",
            ruleName: "Two Level Stayman",
            category: [
              "Responding to an opening",
              "To 1NT",
              "Two Level Stayman",
            ],
            matched: false,
            assisted: false,
          },
          {
            index: 0,
            call: "1N",
            saycCall: "1N",
            category: ["Opening", "1NT, 2NT and 3NT", "Notrump Opening"],
            matched: true,
            assisted: false,
          },
        ],
        completedAt: 1_800_000_000_000 + i * 60_000,
        durationMs: 1_000,
      });
    }
  }
  const FOUND = {
    identifier: "9-00000000000000000000000000",
    category: [
      "Responding to an opening",
      "To 1NT",
      "Jacoby Transfer To Hearts",
    ],
  };

  describe("while bidding", () => {
    it("lets the robots bid first, then hands the box to South and updates the URL", async () => {
      renderPage();
      // The box is on the page from the start, disabled while the robots think.
      expect(screen.getByTestId("bidding-box")).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await waitForRobots();
      expect(mockAddRobotBids).toHaveBeenCalledWith(
        expect.objectContaining({ calls: [] }),
        "S",
        boardId,
      );
      await waitFor(() =>
        expect(screen.getByTestId("location-path")).toHaveTextContent(
          `/bid/${boardId}:1S,P`,
        ),
      );
      expect(screen.getByTestId("board-line")).toHaveTextContent(
        "1 · North · Nobody vulnerable",
      );
      // South's column is the user's.
      expect(
        within(screen.getByTestId("call-table")).getByText("South").textContent,
      ).toContain("you");
      // The engine's call for this turn was fetched before South acted.
      await waitFor(() =>
        expect(mockGetSuggestedCall).toHaveBeenCalledWith(`${boardId}:1S,P`),
      );
    });

    it("checks each call South makes and says what SAYC bids instead", async () => {
      renderPage();
      await waitForRobots();
      mockAddRobotBids.mockResolvedValue({
        dealer: "N",
        calls: [bid(1, "S"), pass, bid(2, "S"), pass],
      });
      const box = screen.getByTestId("bidding-box");
      fireEvent.click(
        within(box)
          .getAllByRole("button")
          .find((b) => b.textContent === "2♠")!,
      );
      await waitFor(() => {
        expect(screen.getByTestId("call-feedback-miss")).toHaveTextContent(
          "You bid 2♠; SAYC bids 3♠: Jump Raise.",
        );
      });
      expect(screen.getByLabelText("differed from SAYC")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /^Keep 2/ }));
      await waitFor(() => expect(screen.getByTestId("call-3")).toBeVisible());
      // The box goes; the call table's mark is what remains of the miss.
      expect(screen.queryByTestId("call-feedback-miss")).toBeNull();
      expect(screen.getByLabelText("differed from SAYC")).toBeInTheDocument();
      expect(mockAddRobotBids).toHaveBeenLastCalledWith(
        expect.objectContaining({
          calls: [bid(1, "S"), pass, bid(2, "S")],
        }),
        "S",
        boardId,
      );
    });

    it("marks a call that matches SAYC without a comparison box", async () => {
      renderPage();
      await waitForRobots();
      mockAddRobotBids.mockResolvedValue({
        dealer: "N",
        calls: [bid(1, "S"), pass, bid(3, "S"), pass],
      });
      fireEvent.click(
        within(screen.getByTestId("bidding-box"))
          .getAllByRole("button")
          .find((b) => b.textContent === "3♠")!,
      );
      await waitFor(() =>
        expect(screen.getByLabelText("matched SAYC")).toBeInTheDocument(),
      );
      expect(screen.queryByTestId("call-feedback-match")).toBeNull();
    });

    it("records a hand bid to the end, with its verdicts, auction, and play", async () => {
      mockGetSuggestedCall.mockImplementation(async (id) => {
        const key = id.split(":")[1] ?? "";
        return key === "1S,P"
          ? {
              call: bid(3, "S"),
              ruleName: "Jump Raise",
              category: ["Responding to an opening", "Raises", "Jump Raise"],
            }
          : { call: pass, category: ["Responder's rebid", "Passing", "Pass"] };
      });
      renderPage();
      await waitForRobots();
      mockAddRobotBids.mockResolvedValue(COMPLETE);
      fireEvent.click(
        within(screen.getByTestId("bidding-box"))
          .getAllByRole("button")
          .find((b) => b.textContent === "3♠")!,
      );
      await screen.findByTestId("verdict-on-system");

      await waitFor(async () => expect(await store.allHands()).toHaveLength(1));
      // The engine's auction and the play analysis land after the write.
      await waitFor(async () => {
        const [hand] = await store.allHands();
        expect(hand.saycCalls).toEqual(
          COMPLETE.calls.map((c) =>
            c.type === "pass" ? "P" : `${c.level}${c.strain}`,
          ),
        );
        expect(hand.table).toEqual(TABLE);
      });
      const [hand] = await store.allHands();
      expect(hand).toMatchObject({
        boardId,
        boardNumber: 1,
        dealer: "N",
        userPosition: "S",
        source: "Random",
        calls: ["1S", "P", "3S", "P", "4S", "P", "P", "P"],
        contract: "4S",
        declarer: "N",
        lead: "D4",
        tricksAfterLead: 11,
      });
      expect(hand.verdicts).toEqual([
        {
          index: 2,
          call: "3S",
          saycCall: "3S",
          ruleName: "Jump Raise",
          category: ["Responding to an opening", "Raises", "Jump Raise"],
          matched: true,
          assisted: false,
        },
        {
          index: 6,
          call: "P",
          saycCall: "P",
          category: ["Responder's rebid", "Passing", "Pass"],
          matched: true,
          assisted: false,
        },
      ]);
      expect(hand.completedAt).toBeGreaterThan(0);
      // The review shows the record in the result card, not in the strip
      // above the auction, which it drops to save the height.
      expect(screen.queryByTestId("progress-strip")).toBeNull();
      expect(screen.getByTestId("record-line")).toHaveTextContent(
        "100% on system",
      );
      expect(screen.getByTestId("record-line")).toHaveTextContent("1 hand");
    });

    it("can hold feedback back until the hand is over", async () => {
      renderPage();
      await waitForRobots();
      mockAddRobotBids.mockResolvedValue({
        dealer: "N",
        calls: [bid(1, "S"), pass, bid(2, "S"), pass],
      });
      fireEvent.click(
        within(screen.getByTestId("bidding-box"))
          .getAllByRole("button")
          .find((b) => b.textContent === "2♠")!,
      );
      const defer = await screen.findByRole("button", {
        name: /hide until the end/i,
      });
      fireEvent.click(defer);
      expect(screen.queryByTestId("call-feedback-miss")).toBeNull();
      expect(screen.queryByLabelText("differed from SAYC")).toBeNull();
      // Nothing is held back with feedback at the end: the table bids on.
      await waitFor(() =>
        expect(mockAddRobotBids).toHaveBeenLastCalledWith(
          expect.objectContaining({ calls: [bid(1, "S"), pass, bid(2, "S")] }),
          "S",
          boardId,
        ),
      );
      await waitFor(async () =>
        expect(await store.getSetting("feedbackTiming")).toBe("end"),
      );
    });

    it("explains a miss against South's own hand", async () => {
      mockParseBoardId.mockReturnValue(withSouth);
      renderPage();
      await waitForRobots();
      mockAddRobotBids.mockResolvedValue({
        dealer: "N",
        calls: [bid(1, "S"), pass, bid(2, "S"), pass],
      });
      fireEvent.click(
        within(screen.getByTestId("bidding-box"))
          .getAllByRole("button")
          .find((b) => b.textContent === "2♠")!,
      );
      const feedback = await screen.findByTestId("call-feedback-miss");
      await waitFor(() =>
        expect(feedback).toHaveTextContent("You have 10 hcp and 4 ♠."),
      );
      expect(feedback).toHaveTextContent(
        "2♠ doesn't fit your hand. Needs 6–9 hcp, you have 10.",
      );
      // Weighed at the point South called, not after.
      expect(mockGetHandAnalysis).toHaveBeenCalledWith(
        SOUTH,
        "1S,P",
        "N",
        "None",
      );
    });

    it("explains the SAYC bid in full against South's hand when asked", async () => {
      mockParseBoardId.mockReturnValue(withSouth);
      renderPage();
      await waitForRobots();
      expect(mockGetHandAnalysis).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: /show sayc bid/i }));
      const hint = await screen.findByTestId("sayc-hint");
      await waitFor(() =>
        expect(hint).toHaveTextContent("You have 10 hcp and 4 ♠."),
      );
      expect(hint).toHaveTextContent(
        "Why not 1NT? SAYC prefers 3♠: raising partner's major comes before limiting a balanced hand in notrump.",
      );
    });

    it("never weighs a hand on the options sheet or for another seat's call", async () => {
      mockParseBoardId.mockReturnValue(withSouth);
      renderPage();
      await waitForRobots();
      fireEvent.click(screen.getByRole("button", { name: "Options" }));
      const sheet = await screen.findByRole("dialog");
      await waitFor(() =>
        expect(within(sheet).getByText("Simple Raise")).toBeInTheDocument(),
      );
      expect(sheet).not.toHaveTextContent("You have");
      fireEvent.click(within(sheet).getByRole("button", { name: "Close" }));

      // North's opening is explained by its rule alone.
      fireEvent.click(
        within(screen.getByTestId("call-table")).getByTestId("call-0"),
      );
      await waitFor(() =>
        expect(screen.getByTestId("call-explanation")).toHaveTextContent(
          "SAYC has no rule for this call here",
        ),
      );
      expect(screen.queryByTestId("hand-reasons")).toBeNull();
      expect(mockGetHandAnalysis).not.toHaveBeenCalled();
    });

    it("explains South's own call in the auction against the hand", async () => {
      mockParseBoardId.mockReturnValue(withSouth);
      renderPage();
      await waitForRobots();
      mockAddRobotBids.mockResolvedValue({
        dealer: "N",
        calls: [bid(1, "S"), pass, bid(2, "S"), pass],
      });
      fireEvent.click(
        within(screen.getByTestId("bidding-box"))
          .getAllByRole("button")
          .find((b) => b.textContent === "2♠")!,
      );
      await screen.findByTestId("call-feedback-miss");
      fireEvent.click(await screen.findByRole("button", { name: /^Keep 2/ }));
      await waitFor(() => expect(screen.getByTestId("call-3")).toBeVisible());
      fireEvent.click(
        within(screen.getByTestId("call-table")).getByTestId("call-2"),
      );
      const explanation = await screen.findByTestId("call-explanation");
      await waitFor(() =>
        expect(
          within(explanation).getByTestId("hand-reasons"),
        ).toHaveTextContent(
          "2♠ doesn't fit your hand. Needs 6–9 hcp, you have 10.",
        ),
      );
    });

    it("keeps the explanation of South's call from giving away a held-back verdict", async () => {
      await store.setSetting("feedbackTiming", "end");
      mockParseBoardId.mockReturnValue(withSouth);
      renderPage();
      await waitForRobots();
      mockAddRobotBids.mockResolvedValue({
        dealer: "N",
        calls: [bid(1, "S"), pass, bid(2, "S"), pass],
      });
      fireEvent.click(
        within(screen.getByTestId("bidding-box"))
          .getAllByRole("button")
          .find((b) => b.textContent === "2♠")!,
      );
      await waitFor(() =>
        expect(screen.getByTestId("location-path")).toHaveTextContent(
          `/bid/${boardId}:1S,P,2S,P`,
        ),
      );
      fireEvent.click(
        within(screen.getByTestId("call-table")).getByTestId("call-2"),
      );
      await waitFor(() =>
        expect(screen.getByTestId("call-explanation")).toHaveTextContent(
          "Simple Raise",
        ),
      );
      expect(screen.queryByTestId("call-feedback-miss")).toBeNull();
      expect(screen.queryByTestId("hand-reasons")).toBeNull();
      expect(mockGetHandAnalysis).not.toHaveBeenCalled();
    });

    it("opens a point in Explore with South's hand in session storage, not the link", async () => {
      mockParseBoardId.mockReturnValue(withSouth);
      renderPage();
      await waitForRobots();
      fireEvent.click(screen.getByRole("button", { name: "Options" }));
      const sheet = await screen.findByRole("dialog");
      fireEvent.click(
        within(sheet).getByRole("button", { name: "Explore from here" }),
      );
      await waitFor(() =>
        expect(screen.getByTestId("location-path")).toHaveTextContent(
          "/explore/1:1S,P",
        ),
      );
      expect(screen.getByTestId("location-path").textContent).not.toContain(
        "963",
      );
      // South's hand alone: the other three are not the learner's to see.
      expect(window.sessionStorage.getItem(HANDS_KEY)).toBe(
        "S=963.A52.Q83.KJ74",
      );
    });

    it("shows the SAYC bid on request, bids it in one tap, and does not count it", async () => {
      renderPage();
      await waitForRobots();
      fireEvent.click(screen.getByRole("button", { name: /show sayc bid/i }));
      const hint = await screen.findByTestId("sayc-hint");
      expect(hint).toHaveTextContent("SAYC bids 3♠: Jump Raise");
      expect(hint).toHaveTextContent("10-12 hcp, 4+");

      mockAddRobotBids.mockResolvedValue({
        dealer: "N",
        calls: [bid(1, "S"), pass, bid(3, "S"), pass],
      });
      fireEvent.click(within(hint).getByRole("button", { name: /bid 3/i }));
      await waitFor(() =>
        expect(screen.getByLabelText("matched SAYC")).toBeInTheDocument(),
      );
      expect(screen.queryByTestId("sayc-hint")).toBeNull();
      expect(screen.queryByTestId("call-feedback-match")).toBeNull();
    });

    it("lists every option in place and bids the tapped one", async () => {
      renderPage();
      await waitForRobots();
      fireEvent.click(screen.getByRole("button", { name: "Options" }));
      const sheet = await screen.findByRole("dialog");
      expect(sheet).toHaveAccessibleName("Options after 1♠ · Pass");
      await waitFor(() =>
        expect(within(sheet).getByText("Simple Raise")).toBeInTheDocument(),
      );
      expect(mockGetCallInterpretations).toHaveBeenCalledWith(
        "1S,P",
        "N",
        "None",
      );

      mockAddRobotBids.mockResolvedValue({
        dealer: "N",
        calls: [bid(1, "S"), pass, bid(3, "S"), pass],
      });
      fireEvent.click(within(sheet).getByText("Jump Raise"));
      expect(screen.queryByRole("dialog")).toBeNull();
      await waitFor(() =>
        expect(mockAddRobotBids).toHaveBeenLastCalledWith(
          expect.objectContaining({ calls: [bid(1, "S"), pass, bid(3, "S")] }),
          "S",
          boardId,
        ),
      );
    });

    it("explains a tapped call and offers the options at that point, read-only", async () => {
      mockGetCallInterpretations.mockResolvedValue([
        { call: bid(1, "S"), ruleName: "One Level Suit Opening" },
        { call: bid(1, "N"), ruleName: "Notrump Opening" },
      ]);
      renderPage();
      await waitForRobots();
      fireEvent.click(
        within(screen.getByTestId("call-table")).getByTestId("call-0"),
      );
      await waitFor(() =>
        expect(screen.getByTestId("call-explanation")).toHaveTextContent(
          "One Level Suit Opening",
        ),
      );
      expect(mockGetCallInterpretations).toHaveBeenCalledWith("", "N", "None");

      fireEvent.click(screen.getByRole("button", { name: "All options here" }));
      const sheet = await screen.findByRole("dialog");
      expect(sheet).toHaveAccessibleName("Options as opener");
      await waitFor(() =>
        expect(within(sheet).getByText("Notrump Opening")).toBeInTheDocument(),
      );
      // An earlier point cannot be bid from.
      expect(
        within(sheet).queryByRole("button", { name: /notrump opening/i }),
      ).toBeNull();
    });

    it("takes back South's last call and re-opens that turn", async () => {
      renderPage();
      await waitForRobots();
      // Nothing of South's to undo yet.
      expect(screen.getByRole("button", { name: "Undo bid" })).toBeDisabled();

      mockAddRobotBids.mockResolvedValue({
        dealer: "N",
        calls: [bid(1, "S"), pass, bid(2, "S"), pass, bid(3, "S"), pass],
      });
      fireEvent.click(
        within(screen.getByTestId("bidding-box"))
          .getAllByRole("button")
          .find((b) => b.textContent === "2♠")!,
      );
      fireEvent.click(await screen.findByRole("button", { name: /^Keep 2/ }));
      await waitFor(() =>
        expect(screen.getByTestId("location-path")).toHaveTextContent(
          `${boardId}:1S,P,2S,P,3S,P`,
        ),
      );

      fireEvent.click(screen.getByRole("button", { name: "Undo bid" }));
      // Back to the turn before 2♠, with the robots' replies gone.
      expect(screen.getByTestId("location-path")).toHaveTextContent(
        `/bid/${boardId}:1S,P`,
      );
      expect(screen.queryByTestId("call-feedback-miss")).toBeNull();
      expect(screen.queryByTestId("call-2")).toBeNull();
      expect(screen.getByTestId("bidding-box")).not.toHaveAttribute(
        "aria-disabled",
        "true",
      );
      expect(screen.getByRole("button", { name: "Undo bid" })).toBeDisabled();
      // The re-opened turn's SAYC bid was cached, not fetched again.
      const suggestCalls = mockGetSuggestedCall.mock.calls.filter(
        ([id]) => id === `${boardId}:1S,P`,
      );
      expect(suggestCalls).toHaveLength(1);

      // South can call again from here, but the first try is what counts.
      fireEvent.click(
        within(screen.getByTestId("bidding-box"))
          .getAllByRole("button")
          .find((b) => b.textContent === "3♠")!,
      );
      await screen.findByLabelText("matched SAYC on a retry");
      expect(screen.queryByLabelText("matched SAYC")).toBeNull();
    });

    it("takes back a call while the robots are still thinking", async () => {
      renderPage();
      await waitForRobots();
      let replyWithRobots: (h: CallHistory) => void = () => {};
      mockAddRobotBids.mockReturnValue(
        new Promise((resolve) => {
          replyWithRobots = resolve;
        }),
      );
      fireEvent.click(
        within(screen.getByTestId("bidding-box"))
          .getAllByRole("button")
          .find((b) => b.textContent === "3♠")!,
      );
      expect(screen.getByTestId("bidding-box")).toHaveAttribute(
        "aria-disabled",
        "true",
      );

      fireEvent.click(screen.getByRole("button", { name: "Undo bid" }));
      expect(screen.getByTestId("bidding-box")).not.toHaveAttribute(
        "aria-disabled",
        "true",
      );

      // A late reply from the robots is ignored.
      replyWithRobots({
        dealer: "N",
        calls: [bid(1, "S"), pass, bid(3, "S"), pass],
      });
      await waitFor(() =>
        expect(mockGetSuggestedCall).toHaveBeenCalledWith(`${boardId}:1S,P`),
      );
      expect(screen.queryByTestId("call-2")).toBeNull();
      expect(screen.getByTestId("location-path")).toHaveTextContent(
        `/bid/${boardId}:1S,P`,
      );
    });

    it("holds a miss until South tries again or keeps it", async () => {
      mockGetSuggestedCall.mockImplementation(async (id) => {
        const key = id.split(":")[1] ?? "";
        return key === "1S,P"
          ? { call: bid(3, "S"), ruleName: "Jump Raise", category: ["Raises"] }
          : { call: pass, category: ["Passing"] };
      });
      renderPage();
      await waitForRobots();
      await waitFor(() =>
        expect(mockGetSuggestedCall).toHaveBeenCalledWith(`${boardId}:1S,P`),
      );
      mockAddRobotBids.mockClear();

      callFromBox("2♠");
      const feedback = await screen.findByTestId("call-feedback-miss");
      expect(feedback).toHaveTextContent("You bid 2♠; SAYC bids 3♠");
      // Nobody calls after it, and the box waits for South's choice.
      expect(screen.getByTestId("call-2")).toHaveAttribute("data-held", "true");
      expect(screen.queryByTestId("pending-call")).toBeNull();
      expect(screen.getByTestId("bidding-box")).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      expect(
        screen.getByRole("button", { name: /show sayc bid/i }),
      ).toBeDisabled();
      expect(mockAddRobotBids).not.toHaveBeenCalled();
      expect(screen.getByTestId("location-path")).toHaveTextContent(
        `/bid/${boardId}:1S,P`,
      );

      fireEvent.click(
        within(feedback).getByRole("button", { name: "Try again" }),
      );
      expect(screen.queryByTestId("call-feedback-miss")).toBeNull();
      expect(screen.queryByTestId("call-2")).toBeNull();
      expect(screen.getByTestId("bidding-box")).not.toHaveAttribute(
        "aria-disabled",
        "true",
      );

      // SAYC's call on the second try: the table bids on, with no box to
      // say so, and the call is marked as found on a retry.
      mockAddRobotBids.mockResolvedValue(COMPLETE);
      callFromBox("3♠");
      await screen.findByTestId("result-card");
      expect(mockAddRobotBids).toHaveBeenCalledWith(
        expect.objectContaining({ calls: [bid(1, "S"), pass, bid(3, "S")] }),
        "S",
        boardId,
      );
      expect(
        within(screen.getByTestId("call-table")).getByLabelText(
          "matched SAYC on a retry",
        ),
      ).toBeInTheDocument();
      // The review reads the auction as it stands, not the try taken back.
      expect(await screen.findByTestId("verdict-on-system")).toHaveTextContent(
        "All 2 of your calls followed SAYC",
      );
      expect(screen.queryByTestId("missed-call")).toBeNull();

      // The record keeps the first try.
      await waitFor(async () => expect(await store.allHands()).toHaveLength(1));
      const [hand] = await store.allHands();
      expect(hand.verdicts[0]).toMatchObject({
        index: 2,
        call: "3S",
        saycCall: "3S",
        firstCall: "2S",
        matched: false,
      });
    });

    it("shows a miss that would end the auction before the review", async () => {
      // West deals and three pass; SAYC opens 1NT in fourth seat.
      const passedToSouth: CallHistory = {
        dealer: "W",
        calls: [pass, pass, pass],
      };
      mockParseBoardId.mockReturnValue({ ...dummyParsed, dealer: "W" });
      mockAddRobotBids.mockResolvedValue(passedToSouth);
      mockGetSuggestedCall.mockResolvedValue({
        call: bid(1, "N"),
        ruleName: "Notrump Opening",
      });
      renderPage();
      await waitForRobots();
      await waitFor(() =>
        expect(mockGetSuggestedCall).toHaveBeenCalledWith(`${boardId}:P,P,P`),
      );

      callFromBox("Pass");
      expect(await screen.findByTestId("call-feedback-miss")).toHaveTextContent(
        "You bid Pass; SAYC bids 1NT",
      );
      expect(screen.queryByTestId("result-card")).toBeNull();

      mockAddRobotBids.mockResolvedValue({
        ...passedToSouth,
        calls: [...passedToSouth.calls, pass],
      });
      fireEvent.click(screen.getByRole("button", { name: "Keep Pass" }));
      await screen.findByTestId("result-card");
      expect(screen.getByTestId("verdict-missed")).toHaveTextContent(
        "1 of your 1 call differed from SAYC",
      );
    });

    it("lets a call held before SAYC's answer go on once it matches", async () => {
      let answer: (call: CallInterpretation) => void = () => {};
      mockGetSuggestedCall.mockReturnValue(
        new Promise((resolve) => {
          answer = resolve;
        }),
      );
      renderPage();
      await waitForRobots();
      mockAddRobotBids.mockClear();
      callFromBox("3♠");
      expect(mockAddRobotBids).not.toHaveBeenCalled();
      answer({ call: bid(3, "S"), ruleName: "Jump Raise" });
      await waitFor(() =>
        expect(mockAddRobotBids).toHaveBeenCalledWith(
          expect.objectContaining({ calls: [bid(1, "S"), pass, bid(3, "S")] }),
          "S",
          boardId,
        ),
      );
      expect(screen.queryByTestId("call-feedback-miss")).toBeNull();
    });

    it("restarts the hand from the first call", async () => {
      renderPage();
      await waitForRobots();
      mockAddRobotBids.mockClear();
      fireEvent.click(screen.getByRole("button", { name: /restart hand/i }));
      await waitFor(() =>
        expect(mockAddRobotBids).toHaveBeenCalledWith(
          expect.objectContaining({ calls: [] }),
          "S",
          boardId,
        ),
      );
    });

    it("skips to a new hand with the chosen focus", async () => {
      mockGenerateFilteredBoard.mockResolvedValue(
        "2-00000000000000000000000000",
      );
      renderPage();
      await waitForRobots();
      fireEvent.click(screen.getByRole("button", { name: /skip hand/i }));
      await waitFor(() =>
        expect(screen.getByTestId("location-path")).toHaveTextContent(
          "/bid/2-00000000000000000000000000",
        ),
      );
      expect(mockGenerateFilteredBoard).toHaveBeenCalledWith("Random");
    });

    it("deals for a new focus at once when nothing has been bid, and defers it mid-hand", async () => {
      mockGenerateFilteredBoard.mockResolvedValue(
        "3-00000000000000000000000000",
      );
      renderPage();
      await waitForRobots();
      fireEvent.change(screen.getByLabelText("Focus"), {
        target: { value: "Notrump" },
      });
      await waitFor(() =>
        expect(mockGenerateFilteredBoard).toHaveBeenCalledWith("Notrump"),
      );
      await waitFor(async () =>
        expect(await store.getSetting("focus")).toBe("Notrump"),
      );
    });

    it("keeps a focus chosen mid-hand for the next deal", async () => {
      mockGenerateFilteredBoard.mockResolvedValue(
        "4-00000000000000000000000000",
      );
      mockParseBoardId.mockReturnValue({
        ...dummyParsed,
        initialCalls: [bid(1, "S"), pass, bid(3, "S"), pass, bid(4, "S"), pass],
      });
      renderPage(`/bid/${boardId}:1S,P,3S,P,4S,P`);
      await waitForRobots();
      fireEvent.change(screen.getByLabelText("Focus"), {
        target: { value: "Preempt" },
      });
      expect(mockGenerateFilteredBoard).not.toHaveBeenCalled();
      expect(screen.getByTestId("pending-focus")).toHaveTextContent(
        "Next hand: Preempt",
      );
      fireEvent.click(screen.getByRole("button", { name: /skip hand/i }));
      await waitFor(() =>
        expect(mockGenerateFilteredBoard).toHaveBeenCalledWith("Preempt"),
      );
    });

    it("shows a generation error instead of silently changing the requested deal", async () => {
      mockGenerateFilteredBoard.mockRejectedValue(
        new Error("worker unavailable"),
      );
      renderPage();
      await waitForRobots();
      fireEvent.click(screen.getByRole("button", { name: /skip hand/i }));
      await waitFor(() =>
        expect(screen.getByText(/worker unavailable/i)).toBeInTheDocument(),
      );
    });

    it("sets the document title", async () => {
      renderPage();
      await waitFor(() =>
        expect(document.title).toBe("Bidding Practice - SAYC Bridge"),
      );
    });
  });

  describe("in review", () => {
    const renderComplete = () => {
      mockParseBoardId.mockReturnValue({
        ...dummyParsed,
        initialCalls: COMPLETE.calls,
      });
      return renderPage(`/bid/${boardId}:1S,P,3S,P,4S,P,P,P`);
    };

    it("reveals the verdict, the play, and all four hands, in that order", async () => {
      renderComplete();
      await waitFor(() =>
        expect(screen.getByTestId("verdict-on-system")).toHaveTextContent(
          "All 2 of your calls followed SAYC",
        ),
      );
      expect(document.title).toBe("Bidding Results - SAYC Bridge");
      expect(screen.getByTestId("contract")).toHaveTextContent("4♠ by North");
      // Verdicts for a permalink's earlier calls were fetched one by one.
      expect(mockGetSuggestedCall).toHaveBeenCalledWith(`${boardId}:1S,P`);
      expect(mockGetSuggestedCall).toHaveBeenCalledWith(
        `${boardId}:1S,P,3S,P,4S,P`,
      );
      expect(mockAddRobotBids).not.toHaveBeenCalled();

      // The result reads with the contract, as the card's headline.
      await waitFor(() =>
        expect(screen.getByTestId("contract-result")).toHaveTextContent(
          "Makes 4 (10 tricks)",
        ),
      );
      expect(screen.getByTestId("double-dummy-after-lead")).toHaveTextContent(
        "makes 5 (11 tricks)",
      );
      expect(screen.queryByTestId("play-verdict")).toBeNull();
      expect(mockGetTricksAfterLead).toHaveBeenCalledWith(
        dummyParsed.deal,
        "S",
        "N",
        { suit: "D", rank: "4" },
      );

      const order = ["contract", "review-summary", "hand-diagram"].map((id) =>
        screen.getByTestId(id),
      );
      expect(
        order[0].compareDocumentPosition(order[1]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        order[1].compareDocumentPosition(order[2]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        screen.getByRole("button", { name: /next hand/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /bid again/i }),
      ).toBeInTheDocument();
    });

    it("scrolls the result into view when the auction ends", async () => {
      const scrollIntoView = vi.fn();
      vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(
        scrollIntoView,
      );
      renderComplete();
      const result = await screen.findByTestId("result-card");
      // The auction the user watched is above the fold they are looking at.
      expect(scrollIntoView.mock.instances).toContain(result);
      vi.restoreAllMocks();
    });

    it("takes the next hand from the top of the page", async () => {
      const scrollTo = vi
        .spyOn(window, "scrollTo")
        .mockImplementation(() => {});
      renderComplete();
      await screen.findByTestId("result-card");
      // The review leaves the window at the foot of the page; the next
      // hand is bid from the board line, the auction and the bidding box.
      fireEvent.click(screen.getByRole("button", { name: /next hand/i }));
      expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
      vi.restoreAllMocks();
    });

    it("does not record a hand that arrived complete from a permalink", async () => {
      renderComplete();
      await screen.findByTestId("verdict-on-system");
      await screen.findByTestId("contract-result");
      expect(await store.allHands()).toEqual([]);
      // Nothing recorded, so the result card has no record line to show.
      expect(screen.queryByTestId("record-line")).toBeNull();
    });

    it("explains each call that differed against South's hand", async () => {
      mockParseBoardId.mockReturnValue({
        ...withSouth,
        initialCalls: [bid(1, "S"), pass, bid(2, "S"), pass, pass, pass],
      });
      renderPage(`/bid/${boardId}:1S,P,2S,P,P,P`);
      const missed = await screen.findByTestId("missed-call");
      await waitFor(() =>
        expect(missed).toHaveTextContent(
          "You have 10 hcp and 4 ♠.2♠ doesn't fit your hand. Needs 6–9 hcp, you have 10.",
        ),
      );
    });

    it("lists the calls that differed and where SAYC's own auction ends", async () => {
      mockParseBoardId.mockReturnValue({
        ...dummyParsed,
        initialCalls: [bid(1, "S"), pass, bid(2, "S"), pass, pass, pass],
      });
      renderPage(`/bid/${boardId}:1S,P,2S,P,P,P`);
      await waitFor(() =>
        expect(screen.getByTestId("verdict-missed")).toHaveTextContent(
          "1 of your 1 call differed from SAYC",
        ),
      );
      expect(screen.getByTestId("missed-call")).toHaveTextContent(
        "You bid 2♠. SAYC bids 3♠: Jump Raise.",
      );
      expect(screen.getByTestId("sayc-auction")).toHaveTextContent(
        "SAYC reaches 4♠ by North",
      );
      // The diagram gives each side's points and what it could have made.
      expect(screen.getByTestId("side-NS")).toHaveTextContent(/N-S \d+ HCP/);
      expect(screen.getByTestId("makeable-NS")).toHaveTextContent(
        "4NT, 4♠, 4♥, 4♦, 4♣",
      );
    });

    it("reports a solver failure instead of the play analysis", async () => {
      mockGetDoubleDummyTable.mockRejectedValue(new Error("no wasm"));
      renderComplete();
      await waitFor(() =>
        expect(screen.getByTestId("double-dummy-error")).toHaveTextContent(
          "no wasm",
        ),
      );
    });

    it("shares the bare board, not the auction, so the recipient can bid it", async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "share", {
        value: share,
        configurable: true,
      });
      try {
        renderComplete();
        await screen.findByTestId("verdict-on-system");
        fireEvent.click(screen.getByRole("button", { name: /share hand/i }));
        await waitFor(() =>
          expect(share).toHaveBeenCalledWith(
            expect.objectContaining({
              url: `https://saycbridge.com/bid/${boardId}`,
            }),
          ),
        );
      } finally {
        // @ts-expect-error -- test-only cleanup of a per-test stub.
        delete navigator.share;
      }
    });

    it("bids the same board again", async () => {
      renderComplete();
      await screen.findByTestId("verdict-on-system");
      fireEvent.click(screen.getByRole("button", { name: /bid again/i }));
      await waitFor(() =>
        expect(mockAddRobotBids).toHaveBeenCalledWith(
          expect.objectContaining({ calls: [] }),
          "S",
          boardId,
        ),
      );
    });
  });

  describe("adaptive practice", () => {
    it("offers Weak spots only once the record shows one", async () => {
      renderPage();
      await waitForRobots();
      const option = screen.getByRole("option", {
        name: "Weak spots",
      }) as HTMLOptionElement;
      expect(option.disabled).toBe(true);
    });

    it("finds a hand for a weak spot, in short requests, and says what it practices", async () => {
      await recordWithWeakSpot();
      mockGenerateAdaptiveBoard
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(FOUND);
      renderPage();
      await waitForRobots();
      await waitFor(() =>
        expect(
          (
            screen.getByRole("option", {
              name: "Weak spots",
            }) as HTMLOptionElement
          ).disabled,
        ).toBe(false),
      );

      fireEvent.change(screen.getByLabelText("Focus"), {
        target: { value: "Adaptive" },
      });
      await waitFor(() =>
        expect(screen.getByTestId("location-path")).toHaveTextContent(
          `/bid/${FOUND.identifier}`,
        ),
      );
      expect(mockGenerateAdaptiveBoard).toHaveBeenCalledWith(
        [["Responding to an opening", "To 1NT"]],
        3,
      );
      expect(await store.getSetting("focus")).toBe("Adaptive");
    });

    it("deals a random hand when no weak-spot hand turns up in time", async () => {
      await recordWithWeakSpot();
      mockGenerateFilteredBoard.mockResolvedValue(
        "5-00000000000000000000000000",
      );
      renderPage();
      await waitForRobots();
      await waitFor(() =>
        expect(
          (
            screen.getByRole("option", {
              name: "Weak spots",
            }) as HTMLOptionElement
          ).disabled,
        ).toBe(false),
      );
      fireEvent.change(screen.getByLabelText("Focus"), {
        target: { value: "Adaptive" },
      });
      await waitFor(() =>
        expect(screen.getByTestId("location-path")).toHaveTextContent(
          "/bid/5-00000000000000000000000000",
        ),
      );
      expect(mockGenerateAdaptiveBoard).toHaveBeenCalledTimes(10);
      expect(mockGenerateFilteredBoard).toHaveBeenCalledWith("Random");
    });

    it("deals for the weak spot Practice this asked for, straight away", async () => {
      mockGenerateAdaptiveBoard.mockResolvedValue(FOUND);
      renderPage(`/bid/${boardId}`, {
        dealAdaptive: { targets: [["Competing", "Takeout doubles"]] },
      });
      await waitFor(() =>
        expect(screen.getByTestId("location-path")).toHaveTextContent(
          `/bid/${FOUND.identifier}`,
        ),
      );
      expect(mockGenerateAdaptiveBoard).toHaveBeenCalledWith(
        [["Competing", "Takeout doubles"]],
        3,
      );
    });

    it("aims at the one weak spot Practice this chose until told to widen", async () => {
      await store.setSetting("focus", "Adaptive");
      await store.setSetting("adaptiveTargets", [
        ["Competing", "Takeout doubles"],
      ]);
      await recordWithWeakSpot();
      mockGenerateAdaptiveBoard.mockReturnValue(new Promise(() => {}));
      renderPage();
      await waitForRobots();
      const status = await screen.findByTestId("adaptive-status");
      await waitFor(() =>
        expect(status).toHaveTextContent("Aiming at Takeout doubles."),
      );
      await waitFor(() =>
        expect(mockGenerateAdaptiveBoard).toHaveBeenCalledWith(
          [["Competing", "Takeout doubles"]],
          3,
        ),
      );

      fireEvent.click(screen.getByRole("button", { name: "All weak spots" }));
      await waitFor(() =>
        expect(screen.getByTestId("adaptive-status")).toHaveTextContent(
          "Aiming at To 1NT.",
        ),
      );
      await waitFor(async () =>
        expect(await store.getSetting("adaptiveTargets")).toBeNull(),
      );
    });

    it("says which weak spot this hand practices, and records it as adaptive", async () => {
      await store.setSetting("focus", "Adaptive");
      await recordWithWeakSpot();
      mockGenerateAdaptiveBoard.mockResolvedValue(FOUND);
      renderPage(`/bid/${boardId}`, {
        adaptive: {
          category: FOUND.category,
          targets: [["Responding to an opening", "To 1NT"]],
        },
      });
      await waitForRobots();
      expect(await screen.findByTestId("adaptive-status")).toHaveTextContent(
        "This hand practices To 1NT.",
      );
      // The next board is found in the background while the user bids.
      await waitFor(() => expect(mockGenerateAdaptiveBoard).toHaveBeenCalled());

      mockAddRobotBids.mockResolvedValue(COMPLETE);
      fireEvent.click(
        within(screen.getByTestId("bidding-box"))
          .getAllByRole("button")
          .find((b) => b.textContent === "3♠")!,
      );
      await screen.findByTestId("verdict-on-system");
      // The seeded hands carry later timestamps, so find this one by board.
      await waitFor(async () => {
        const hands = await store.allHands();
        expect(hands.find((h) => h.boardId === boardId)).toMatchObject({
          source: "Adaptive",
          targets: [["Responding to an opening", "To 1NT"]],
        });
      });

      // Next hand uses the board found in the background: a fresh search
      // would never resolve from here.
      mockGenerateAdaptiveBoard.mockReturnValue(new Promise(() => {}));
      fireEvent.click(screen.getByRole("button", { name: /next hand/i }));
      await waitFor(() =>
        expect(screen.getByTestId("location-path")).toHaveTextContent(
          `/bid/${FOUND.identifier}`,
        ),
      );
    });
  });
});
