import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PracticePage } from "../PracticePage";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as auction from "../../bridge/auction";
import * as identifier from "../../bridge/identifier";
import * as engine from "../../bridge/engine";

// Mock the bridge modules
vi.mock("../../bridge/auction", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../bridge/auction")>();
  return {
    ...actual,
    addRobotBids: vi.fn(),
    isAuctionComplete: vi.fn(),
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
    getSuggestedBid: vi.fn(),
    getInterpretations: vi.fn(),
  };
});

const mockAddRobotBids = vi.mocked(auction.addRobotBids);
const mockIsAuctionComplete = vi.mocked(auction.isAuctionComplete);
const mockParseBoardId = vi.mocked(identifier.parseBoardId);
const mockGetInterpretations = vi.mocked(engine.getInterpretations);

describe("PracticePage", () => {
  const boardId = "1-00000000000000000000000000";
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
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockParseBoardId.mockReturnValue(dummyParsed);
    mockAddRobotBids.mockResolvedValue({
      dealer: "N",
      calls: [{ type: "pass" }],
    });
    mockIsAuctionComplete.mockReturnValue(false);
  });

  const renderPage = () => {
    return render(
      <MemoryRouter initialEntries={[`/bid/${boardId}`]}>
        <Routes>
          <Route path="/bid/:boardId" element={<PracticePage />} />
        </Routes>
      </MemoryRouter>,
    );
  };

  it("renders and handles rebid during auction", async () => {
    renderPage();

    // Wait for initial robot bids
    await waitFor(() => expect(mockAddRobotBids).toHaveBeenCalled());

    // Find and click Rebid button
    const rebidButton = await screen.findByRole("button", { name: /rebid/i });
    expect(rebidButton).toBeInTheDocument();

    // Clear mocks to track the rebid call
    mockAddRobotBids.mockClear();

    fireEvent.click(rebidButton);

    // Verify handleRebid was called
    await waitFor(() => {
      // It should call addRobotBids with empty calls history
      expect(mockAddRobotBids).toHaveBeenCalledWith(
        expect.objectContaining({ calls: [] }),
        "S",
        boardId,
      );
    });
  });

  it("shows explanation when a bid in call history is clicked", async () => {
    mockAddRobotBids.mockResolvedValue({
      dealer: "N",
      calls: [{ type: "bid", level: 1, strain: "C" }, { type: "pass" }],
    });
    mockGetInterpretations.mockResolvedValue([
      {
        call: { type: "bid", level: 1, strain: "C" },
        ruleName: "Opening 1♣",
        description: "12-21 HCP, 3+ clubs",
      },
      {
        call: { type: "pass" },
        ruleName: undefined,
        description: undefined,
      },
    ]);

    renderPage();

    // Wait for initial render with calls
    await waitFor(() =>
      expect(screen.queryByText("Thinking...")).not.toBeInTheDocument(),
    );

    // Click the 1♣ bid in the call table (not the BiddingBox)
    const callTable = screen.getByTestId("call-table");
    const clubSymbol = within(callTable).getByText("♣");
    fireEvent.click(clubSymbol.closest("div")!);

    // Should show explanation
    await waitFor(() => {
      expect(screen.getByText(/Opening 1♣/)).toBeInTheDocument();
      expect(screen.getByText("12-21 HCP, 3+ clubs")).toBeInTheDocument();
    });

    expect(mockGetInterpretations).toHaveBeenCalledWith("", "N", "None");
  });

  it("shows 'No interpretation available' for unrecognized bids", async () => {
    mockAddRobotBids.mockResolvedValue({
      dealer: "N",
      calls: [{ type: "pass" }],
    });
    mockGetInterpretations.mockResolvedValue([
      {
        call: { type: "pass" },
        ruleName: undefined,
        description: undefined,
      },
    ]);

    renderPage();

    await waitFor(() =>
      expect(screen.queryByText("Thinking...")).not.toBeInTheDocument(),
    );

    // Click Pass in the call table (not the BiddingBox)
    const callTable = screen.getByTestId("call-table");
    fireEvent.click(within(callTable).getByText("Pass"));

    await waitFor(() => {
      expect(
        screen.getByText(/No interpretation available/),
      ).toBeInTheDocument();
    });
  });

  it("handles rebid after auction completion", async () => {
    mockIsAuctionComplete.mockReturnValue(true);

    renderPage();

    // Wait for render
    const rebidHandButton = await screen.findByRole("button", {
      name: /rebid hand/i,
    });
    expect(rebidHandButton).toBeInTheDocument();

    mockAddRobotBids.mockClear();
    fireEvent.click(rebidHandButton);

    await waitFor(() => {
      expect(mockAddRobotBids).toHaveBeenCalledWith(
        expect.objectContaining({ calls: [] }),
        "S",
        boardId,
      );
    });
  });
  it("renders hand fans for all players when auction is complete", async () => {
    mockIsAuctionComplete.mockReturnValue(true);

    renderPage();

    // Wait for initial robot bids and loading to finish
    await waitFor(() =>
      expect(screen.queryByText("Thinking...")).not.toBeInTheDocument(),
    );

    // Verify we are in the completed auction state
    expect(screen.getByText(/auction complete/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /next hand/i }),
    ).toBeInTheDocument();

    // Verify relative order in the DOM
    const labels = screen.getAllByTestId(/position-label-/);
    const labelPositions = labels.map((l) =>
      l.getAttribute("data-testid")?.replace("position-label-", ""),
    );

    // We expect N, then W and E (order of W/E depends on grid), then S
    const nIndex = labelPositions.indexOf("N");
    const wIndex = labelPositions.indexOf("W");
    const eIndex = labelPositions.indexOf("E");
    const sIndex = labelPositions.indexOf("S");

    expect(nIndex).toBeLessThan(wIndex);
    expect(nIndex).toBeLessThan(eIndex);
    expect(wIndex).toBeLessThan(sIndex);
    expect(eIndex).toBeLessThan(sIndex);
  });
});
