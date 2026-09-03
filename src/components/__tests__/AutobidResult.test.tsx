import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { AutobidResult } from "../AutobidResult";
import type { CallHistory } from "../../bridge";
import * as engine from "../../bridge/engine";

vi.mock("../../bridge/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../bridge/engine")>();
  return {
    ...actual,
    getCallInterpretations: vi.fn(),
  };
});

const mockGetCallInterpretations = vi.mocked(engine.getCallInterpretations);

describe("AutobidResult", () => {
  const matchHistory: CallHistory = {
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

  const userHistoryDiff: CallHistory = {
    dealer: "N",
    calls: [
      { type: "bid", level: 1, strain: "H" },
      { type: "pass" },
      { type: "bid", level: 2, strain: "H" },
      { type: "pass" },
      { type: "pass" },
      { type: "pass" },
    ],
  };

  it("renders nothing when loading or history is null", () => {
    const { container } = render(
      <AutobidResult
        userHistory={matchHistory}
        autobidHistory={null}
        loading={true}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders match message when calls match", () => {
    render(
      <AutobidResult
        userHistory={matchHistory}
        autobidHistory={matchHistory}
      />,
    );
    expect(screen.getByTestId("autobid-result-match")).toHaveTextContent(
      "✓ matches autobidder",
    );
  });

  it("renders autobidder contract and toggles auction table when calls differ", () => {
    render(
      <AutobidResult
        userHistory={userHistoryDiff}
        autobidHistory={matchHistory}
      />,
    );
    expect(screen.getByTestId("autobid-result-differ")).toBeInTheDocument();
    expect(screen.getByTestId("autobid-table-toggle")).toHaveTextContent(
      "4H N",
    );

    // Table is initially closed
    expect(screen.queryByTestId("autobid-call-table")).not.toBeInTheDocument();

    // Click to toggle
    fireEvent.click(screen.getByTestId("autobid-table-toggle"));
    expect(screen.getByTestId("autobid-call-table")).toBeInTheDocument();

    // Click again to close
    fireEvent.click(screen.getByTestId("autobid-table-toggle"));
    expect(screen.queryByTestId("autobid-call-table")).not.toBeInTheDocument();
  });

  it("explains a bid clicked in the autobidder's auction", async () => {
    mockGetCallInterpretations.mockResolvedValue([
      {
        call: { type: "bid", level: 1, strain: "H" },
        ruleName: "OneLevelSuitOpening",
        description: "12-21 HCP, 5+ hearts",
      },
    ]);

    render(
      <AutobidResult
        userHistory={userHistoryDiff}
        autobidHistory={matchHistory}
        vulnerability="NS"
      />,
    );
    fireEvent.click(screen.getByTestId("autobid-table-toggle"));

    const callTable = screen.getByTestId("autobid-call-table");
    // matchHistory bids hearts twice (1H, 4H); the opener is the first.
    fireEvent.click(within(callTable).getAllByText("♥")[0]);

    await waitFor(() => {
      expect(screen.getByText(/OneLevelSuitOpening/)).toBeInTheDocument();
      expect(screen.getByText("12-21 HCP, 5+ hearts")).toBeInTheDocument();
    });
    expect(mockGetCallInterpretations).toHaveBeenCalledWith("", "N", "NS");
  });

  it("links to the explorer for the clicked point in the autobidder's auction", async () => {
    mockGetCallInterpretations.mockResolvedValue([
      {
        call: { type: "pass" },
        ruleName: "DefaultPass",
        description: undefined,
      },
    ]);

    render(
      <MemoryRouter>
        <AutobidResult
          userHistory={userHistoryDiff}
          autobidHistory={matchHistory}
          boardNumber={7}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByTestId("autobid-table-toggle"));

    const callTable = screen.getByTestId("autobid-call-table");
    // The second call (index 1) is Pass, reached after the opening 1H.
    fireEvent.click(within(callTable).getAllByText("Pass")[0]);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /explore/i })).toHaveAttribute(
        "href",
        "/explore/7:1H",
      );
    });
  });
});
