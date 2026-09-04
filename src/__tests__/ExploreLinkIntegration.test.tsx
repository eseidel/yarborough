import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { PracticePage } from "../pages/PracticePage";
import { ExplorePage } from "../pages/ExplorePage";
import * as engine from "../bridge/engine";
import * as auction from "../bridge/auction";

vi.mock("../bridge/engine", () => ({
  getSuggestedCall: vi.fn(),
  getCallInterpretations: vi.fn(),
  getOpeningLead: vi.fn(),
  generateFilteredBoard: vi.fn(),
}));

vi.mock("../bridge/auction", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../bridge/auction")>();
  return {
    ...actual,
    addRobotBids: vi.fn((h) => Promise.resolve(h)),
    getFullAutobidAuction: vi.fn(() => new Promise(() => {})),
  };
});

vi.mock("../dds/dds", () => ({
  getDoubleDummyTable: vi.fn(() => new Promise(() => {})),
  getTricksAfterLead: vi.fn(() => new Promise(() => {})),
}));

// The explorer's knowledge (what every call means at a point in the auction)
// is the same data on both pages; the practice page shows it in place.
describe("Explorer data across pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(engine.getSuggestedCall).mockResolvedValue({
      call: { type: "pass" },
    });
  });

  it("opens the options at a tapped call's point on the practice page", async () => {
    const mockHistory = {
      dealer: "N" as const,
      calls: [
        { type: "bid" as const, level: 1, strain: "H" as const },
        { type: "pass" as const },
      ],
    };
    vi.mocked(auction.addRobotBids).mockResolvedValue(mockHistory);
    vi.mocked(engine.getCallInterpretations).mockResolvedValue([
      {
        call: { type: "bid", level: 1, strain: "H" },
        ruleName: "Opening 1H",
        description: "12+ HCP, 5+ hearts",
      },
      {
        call: { type: "bid", level: 1, strain: "S" },
        ruleName: "Opening 1S",
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/bid/1-00000000000000000000000000"]}>
        <Routes>
          <Route path="/bid/:boardId" element={<PracticePage />} />
        </Routes>
      </MemoryRouter>,
    );

    const callTable = await screen.findByTestId("call-table");
    fireEvent.click(await within(callTable).findByTestId("call-0"));

    const explanation = await screen.findByTestId("call-explanation");
    await waitFor(() => expect(explanation).toHaveTextContent("Opening 1H"));
    fireEvent.click(
      within(explanation).getByRole("button", { name: "All options here" }),
    );
    const sheet = await screen.findByRole("dialog");
    expect(sheet).toHaveAccessibleName("Options as opener");
    await waitFor(() =>
      expect(within(sheet).getByText("Opening 1S")).toBeInTheDocument(),
    );
  });

  it("ExplorePage initializes state from URL parameters", async () => {
    vi.mocked(engine.getCallInterpretations).mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/explore/1:1H,1S"]}>
        <Routes>
          <Route path="/explore/:exploreId" element={<ExplorePage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Should call getCallInterpretations with the calls from the URL
    await waitFor(() => {
      expect(engine.getCallInterpretations).toHaveBeenCalledWith(
        "1H,1S",
        "N",
        "None",
      );
    });

    // Check if calls are rendered in the table (1 and symbol separately)
    expect(screen.getAllByText(/1/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("♥")).toBeInTheDocument();
    expect(screen.getByText("♠")).toBeInTheDocument();
  });
});
