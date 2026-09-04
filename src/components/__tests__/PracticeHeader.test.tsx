import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { type AdaptiveState, PracticeHeader } from "../PracticeHeader";

const NO_ADAPTIVE: AdaptiveState = {
  available: false,
  pinned: false,
  targetsLabel: "",
  practicing: null,
  searching: false,
  fallback: false,
};
const adaptiveProps = { adaptive: NO_ADAPTIVE, onShowAllWeakSpots: () => {} };
import { focusLabel } from "../../practice/focus";

describe("PracticeHeader", () => {
  it("states the board, dealer, and vulnerability in words", () => {
    const { rerender } = render(
      <PracticeHeader
        boardNumber={7}
        dealer="S"
        vulnerability="Both"
        focus="Random"
        pendingFocus={null}
        onFocusChange={() => {}}
        {...adaptiveProps}
      />,
    );
    expect(screen.getByTestId("board-line").textContent).toBe(
      "Board 7 · Dealer South · Both vulnerable",
    );
    rerender(
      <PracticeHeader
        boardNumber={1}
        dealer="N"
        vulnerability="None"
        focus="Random"
        pendingFocus={null}
        onFocusChange={() => {}}
        {...adaptiveProps}
      />,
    );
    expect(screen.getByTestId("board-line").textContent).toBe(
      "Board 1 · Dealer North · Nobody vulnerable",
    );
  });

  it("selects a focus and shows one that waits for the next hand", () => {
    const onFocusChange = vi.fn();
    const { rerender } = render(
      <PracticeHeader
        boardNumber={1}
        dealer="N"
        vulnerability="None"
        focus="Random"
        pendingFocus={null}
        onFocusChange={onFocusChange}
        {...adaptiveProps}
      />,
    );
    expect(screen.getByRole("button", { name: "Random" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByTestId("pending-focus")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Strong 2♣" }));
    expect(onFocusChange).toHaveBeenCalledWith("Strong2C");

    rerender(
      <PracticeHeader
        boardNumber={1}
        dealer="N"
        vulnerability="None"
        focus="Random"
        pendingFocus="Strong2C"
        onFocusChange={onFocusChange}
        {...adaptiveProps}
      />,
    );
    expect(screen.getByRole("button", { name: "Strong 2♣" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("pending-focus").textContent).toBe(
      "Next hand: Strong 2♣",
    );
    expect(focusLabel("Notrump")).toBe("Notrump");
  });

  it("offers Weak spots only once there is something to aim at, and says what it is doing", () => {
    const onFocusChange = vi.fn();
    const onShowAllWeakSpots = vi.fn();
    const base = {
      boardNumber: 1,
      dealer: "N" as const,
      vulnerability: "None" as const,
      pendingFocus: null,
      onFocusChange,
      onShowAllWeakSpots,
    };
    const { rerender } = render(
      <PracticeHeader {...base} focus="Random" adaptive={NO_ADAPTIVE} />,
    );
    const chip = screen.getByRole("button", { name: "Weak spots" });
    expect(chip).toBeDisabled();
    expect(chip).toHaveAttribute(
      "title",
      expect.stringMatching(/bid a few more hands/i),
    );
    expect(screen.queryByTestId("adaptive-status")).toBeNull();

    const available: AdaptiveState = {
      ...NO_ADAPTIVE,
      available: true,
      targetsLabel: "To 1NT and Takeout doubles",
    };
    rerender(<PracticeHeader {...base} focus="Random" adaptive={available} />);
    fireEvent.click(screen.getByRole("button", { name: "Weak spots" }));
    expect(onFocusChange).toHaveBeenCalledWith("Adaptive");

    rerender(
      <PracticeHeader {...base} focus="Adaptive" adaptive={available} />,
    );
    expect(screen.getByTestId("adaptive-status")).toHaveTextContent(
      "Aiming at To 1NT and Takeout doubles.",
    );
    rerender(
      <PracticeHeader
        {...base}
        focus="Adaptive"
        adaptive={{ ...available, practicing: "To 1NT", pinned: true }}
      />,
    );
    expect(screen.getByTestId("adaptive-status")).toHaveTextContent(
      "This hand practices To 1NT.",
    );
    fireEvent.click(screen.getByRole("button", { name: "All weak spots" }));
    expect(onShowAllWeakSpots).toHaveBeenCalled();

    rerender(
      <PracticeHeader
        {...base}
        focus="Adaptive"
        adaptive={{ ...available, searching: true }}
      />,
    );
    expect(screen.getByTestId("adaptive-status")).toHaveTextContent(
      "Finding a hand that practices To 1NT and Takeout doubles…",
    );
    rerender(
      <PracticeHeader
        {...base}
        focus="Adaptive"
        adaptive={{ ...available, fallback: true }}
      />,
    );
    expect(screen.getByTestId("adaptive-status")).toHaveTextContent(
      "No hand for To 1NT and Takeout doubles turned up in time, so this one is random.",
    );
  });
});
