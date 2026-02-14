import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { PracticePage } from "../pages/PracticePage";
import { ExplorePage } from "../pages/ExplorePage";
import * as engine from "../bridge/engine";
import * as auction from "../bridge/auction";

vi.mock("../bridge/engine", () => ({
  getSuggestedBid: vi.fn(),
  getInterpretations: vi.fn(),
}));

vi.mock("../bridge/auction", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../bridge/auction")>();
  return {
    ...actual,
    addRobotBids: vi.fn((h) => Promise.resolve(h)),
  };
});

describe("Explore Link Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows 'Explore ->' link in PracticePage when a bid is clicked", async () => {
    const mockHistory = {
      dealer: "N" as const,
      calls: [{ type: "bid" as const, level: 1, strain: "H" as const }],
    };
    vi.mocked(auction.addRobotBids).mockResolvedValue(mockHistory);
    vi.mocked(engine.getInterpretations).mockResolvedValue([
      {
        call: { type: "bid", level: 1, strain: "H" },
        ruleName: "Opening 1H",
        description: "12+ HCP, 5+ hearts",
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/bid/1-00000000000000000000000000"]}>
        <Routes>
          <Route path="/bid/:boardId" element={<PracticePage />} />
          <Route path="/explore" element={<div>Explore Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    // Wait for initial robot bids
    await waitFor(() => expect(screen.getAllByText(/1/)[0]).toBeInTheDocument());

    // Click the bid to see explanation (it contains a '1' and a '♥')
    const hearts = screen.getAllByText("♥")[0];
    fireEvent.click(hearts.closest("div")!);

    // Check for Explore link within the explanation
    await waitFor(() => {
      const explanation = screen.getByTestId("call-explanation");
      const link = within(explanation).getByRole("link", { name: /explore/i });
      expect(link).toBeInTheDocument();
      // Current bid should NOT be in the history.
      // History was dealer=N, calls=1H. Clicking 1H should link to /explore/1
      expect(link.getAttribute("href")).toBe("/explore/1");
    });
  });

  it("ExplorePage initializes state from URL parameters", async () => {
    vi.mocked(engine.getInterpretations).mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/explore/1:1H,1S"]}>
        <Routes>
          <Route path="/explore/:exploreId" element={<ExplorePage />} />
        </Routes>
      </MemoryRouter>
    );

    // Should call getInterpretations with the calls from the URL
    await waitFor(() => {
      expect(engine.getInterpretations).toHaveBeenCalledWith(
        "1H,1S",
        "N",
        "None"
      );
    });

    // Check if calls are rendered in the table (1 and symbol separately)
    expect(screen.getAllByText(/1/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("♥")).toBeInTheDocument();
    expect(screen.getByText("♠")).toBeInTheDocument();
  });

  it("shows 'Explore ->' link in suggest bid section", async () => {
    vi.mocked(engine.getSuggestedBid).mockResolvedValue({
      call: { type: "bid", level: 1, strain: "S" },
      ruleName: "Opening 1S",
      description: "12+ HCP, 5+ spades",
    });

    render(
      <MemoryRouter initialEntries={["/bid/1-00000000000000000000000000"]}>
        <Routes>
          <Route path="/bid/:boardId" element={<PracticePage />} />
          <Route path="/explore/:exploreId" element={<div>Explore Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    // Click Suggest Bid
    const suggestBtn = await screen.findByRole("button", { name: /suggest bid/i });
    fireEvent.click(suggestBtn);

    // Wait for suggestion and check for Explore link
    const link = await screen.findByRole("button", { name: /explore/i });
    expect(link).toBeInTheDocument();

    // Click it and check if we are on explore page
    fireEvent.click(link);
    expect(screen.getByText("Explore Page")).toBeInTheDocument();
  });
});
