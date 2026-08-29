import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AutobidResult } from "../AutobidResult";
import type { CallHistory } from "../../bridge";

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
});
