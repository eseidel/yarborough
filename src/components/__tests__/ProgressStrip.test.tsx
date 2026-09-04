import {
  fireEvent,
  render as renderBare,
  screen,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProgressStrip } from "../ProgressStrip";
import type { Summary } from "../../practice/stats";

const SUMMARY: Summary = {
  hands: 5,
  handsOnSystem: 3,
  calls: 12,
  matched: 9,
  streak: 2,
  bestStreak: 3,
  bySource: {
    Random: { hands: 3, handsOnSystem: 2, calls: 7, matched: 6 },
    Notrump: { hands: 2, handsOnSystem: 1, calls: 5, matched: 3 },
  },
};

const EMPTY: Summary = {
  hands: 0,
  handsOnSystem: 0,
  calls: 0,
  matched: 0,
  streak: 0,
  bestStreak: 0,
  bySource: {},
};

const render = (ui: ReactElement) =>
  renderBare(<MemoryRouter>{ui}</MemoryRouter>);

describe("ProgressStrip", () => {
  it("renders nothing before the first hand", () => {
    const { container } = render(
      <ProgressStrip summary={EMPTY} onReset={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("summarizes accuracy, hands, and the streak, and expands to a breakdown", () => {
    const onReset = vi.fn();
    render(<ProgressStrip summary={SUMMARY} onReset={onReset} />);
    const strip = screen.getByTestId("progress-strip");
    expect(strip.textContent).toContain("75%");
    expect(strip.textContent).toContain("5 hands");
    expect(strip.textContent).toContain("🔥 2");
    expect(screen.queryByTestId("progress-details")).toBeNull();

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    const details = screen.getByTestId("progress-details");
    expect(details.textContent).toContain("9 of 12 checked calls matched SAYC");
    expect(details.textContent).toContain("best streak 3");
    expect(screen.getByTestId("focus-Notrump").textContent).toBe("Notrump260%");

    fireEvent.click(screen.getByRole("button", { name: /reset progress/i }));
    expect(onReset).toHaveBeenCalled();
  });

  it("omits the breakdown and the streak when there is nothing to break down", () => {
    render(
      <ProgressStrip
        summary={{ ...SUMMARY, bySource: { Random: SUMMARY }, streak: 0 }}
        onReset={() => {}}
      />,
    );
    expect(screen.getByTestId("progress-strip").textContent).not.toContain(
      "🔥",
    );
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(screen.queryByRole("table")).toBeNull();
  });
});
