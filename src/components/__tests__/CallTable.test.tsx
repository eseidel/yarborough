import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { CallTable } from "../CallTable";
import type { CallHistory, Call } from "../../bridge/types";

describe("CallTable", () => {
  const makeHistory = (calls: Call[], dealer = "N" as const): CallHistory => ({
    dealer,
    calls,
  });

  it("renders calls in the table", () => {
    const history = makeHistory([
      { type: "bid", level: 1, strain: "C" },
      { type: "pass" },
    ]);

    render(<CallTable callHistory={history} />);

    expect(screen.getByText("Pass")).toBeInTheDocument();
  });

  it("fires onCallClick with the correct index when a call is clicked", () => {
    const onClick = vi.fn();
    const history = makeHistory([
      { type: "bid", level: 1, strain: "C" },
      { type: "pass" },
      { type: "bid", level: 1, strain: "H" },
    ]);

    render(<CallTable callHistory={history} onCallClick={onClick} />);

    // Click the second call (Pass)
    fireEvent.click(screen.getByText("Pass"));
    expect(onClick).toHaveBeenCalledWith(1);

    onClick.mockClear();

    // Click the first call (1♣)
    fireEvent.click(screen.getByText("♣").closest("div")!);
    expect(onClick).toHaveBeenCalledWith(0);
  });

  it("highlights the selected call", () => {
    const history = makeHistory([
      { type: "bid", level: 1, strain: "C" },
      { type: "pass" },
    ]);

    render(
      <CallTable
        callHistory={history}
        onCallClick={() => { }}
        selectedCallIndex={0}
      />,
    );

    // The first call's wrapper div should have the amber highlight
    const clubSpan = screen.getByText("♣").closest("div");
    expect(clubSpan?.className).toContain("bg-amber-200");

    // The second call should not
    const passDiv = screen.getByText("Pass").closest("div");
    expect(passDiv?.className).not.toContain("bg-amber-200");
  });

  it("applies cursor-pointer when onCallClick is provided", () => {
    const history = makeHistory([{ type: "pass" }]);

    render(<CallTable callHistory={history} onCallClick={() => { }} />);

    const passDiv = screen.getByText("Pass").closest("div");
    expect(passDiv?.className).toContain("cursor-pointer");
  });

  it("does not apply cursor-pointer when onCallClick is not provided", () => {
    const history = makeHistory([{ type: "pass" }]);

    render(<CallTable callHistory={history} />);

    const passDiv = screen.getByText("Pass").closest("div");
    expect(passDiv?.className).not.toContain("cursor-pointer");
  });

  it("renders explanation inline below the selected call's row", () => {
    const history = makeHistory([
      { type: "bid", level: 1, strain: "C" },
      { type: "pass" },
    ]);

    render(
      <CallTable
        callHistory={history}
        onCallClick={() => { }}
        selectedCallIndex={0}
        callExplanation={{
          call: { type: "bid", level: 1, strain: "C" },
          ruleName: "Opening 1C",
          description: "12-21 HCP, 3+ clubs",
        }}
      />,
    );

    const explanation = screen.getByTestId("call-explanation");
    expect(explanation).toBeInTheDocument();
    expect(explanation.textContent).toContain("Opening 1C");
    expect(explanation.textContent).toContain("12-21 HCP, 3+ clubs");
    expect(explanation.className).toContain("col-span-4");
  });

  it("shows 'No interpretation available' when explanation has no rule", () => {
    const history = makeHistory([{ type: "pass" }]);

    render(
      <CallTable
        callHistory={history}
        onCallClick={() => { }}
        selectedCallIndex={0}
        callExplanation={{
          call: { type: "pass" },
        }}
      />,
    );

    expect(screen.getByText("No interpretation available")).toBeInTheDocument();
  });

  it("shows loading state for explanation", () => {
    const history = makeHistory([{ type: "pass" }]);

    render(
      <CallTable
        callHistory={history}
        onCallClick={() => { }}
        selectedCallIndex={0}
        explanationLoading={true}
      />,
    );

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders '?' before explanation when auction is incomplete and call on same row is selected", () => {
    // 1C (index 0)
    // ?  (index 1) - virtual
    const history = makeHistory([{ type: "bid", level: 1, strain: "C" }]);

    render(
      <CallTable
        callHistory={history}
        onCallClick={() => { }}
        selectedCallIndex={0}
        callExplanation={{
          call: { type: "bid", level: 1, strain: "C" },
          ruleName: "Opening 1C",
        }}
      />,
    );

    const table = screen.getByTestId("call-table");
    const container = table.querySelector(".grid")!;

    // Find all children that are either the "?" or the explanation
    const children = Array.from(container.children);
    const questionIndex = children.findIndex((c) => c.textContent === "?");
    const explanationIndex = children.findIndex(
      (c) => c.getAttribute("data-testid") === "call-explanation",
    );

    expect(questionIndex).not.toBe(-1);
    expect(explanationIndex).not.toBe(-1);
    // "?" should come before the explanation in the DOM order (to be in its grid cell)
    expect(questionIndex).toBeLessThan(explanationIndex);
  });
});
