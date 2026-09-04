import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PracticeHeader } from "../PracticeHeader";
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
});
