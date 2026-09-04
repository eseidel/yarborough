import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProgressStrip } from "../ProgressStrip";
import { EMPTY_PROGRESS, type Progress } from "../../practice/progress";

const PROGRESS: Progress = {
  version: 1,
  total: { hands: 5, handsOnSystem: 3, calls: 12, callsMatched: 9 },
  byFocus: {
    Random: { hands: 3, handsOnSystem: 2, calls: 7, callsMatched: 6 },
    Notrump: { hands: 2, handsOnSystem: 1, calls: 5, callsMatched: 3 },
  },
  streak: 2,
  bestStreak: 3,
  recorded: [],
};

describe("ProgressStrip", () => {
  it("renders nothing before the first hand", () => {
    const { container } = render(
      <ProgressStrip progress={EMPTY_PROGRESS} onReset={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("summarizes accuracy, hands, and the streak, and expands to a breakdown", () => {
    const onReset = vi.fn();
    render(<ProgressStrip progress={PROGRESS} onReset={onReset} />);
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
        progress={{
          ...PROGRESS,
          byFocus: { Random: PROGRESS.total },
          streak: 0,
        }}
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
