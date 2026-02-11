import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PracticePage } from "../PracticePage";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as auction from "../../bridge/auction";
import * as identifier from "../../bridge/identifier";

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

const mockAddRobotBids = vi.mocked(auction.addRobotBids);
const mockIsAuctionComplete = vi.mocked(auction.isAuctionComplete);
const mockParseBoardId = vi.mocked(identifier.parseBoardId);

describe("PracticePage", () => {
  const boardId = "1-00000000000000000000000000";
  const dummyParsed = {
    deal: {
      north: { cards: [] },
      east: { cards: [] },
      south: { cards: [] },
      west: { cards: [] },
    },
    dealer: "N",
    vulnerability: "None",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockParseBoardId.mockReturnValue(dummyParsed as any);
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
});
