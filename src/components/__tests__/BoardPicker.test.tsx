import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BoardPicker } from "../BoardPicker";

describe("BoardPicker", () => {
  it("says what the board decides, in one line", () => {
    render(<BoardPicker boardNumber={3} onSelect={vi.fn()} />);
    expect(screen.getByText("Board 3")).toBeInTheDocument();
    // Board 3 is South's deal with East-West vulnerable, and those are the
    // only two things the number is worth knowing for.
    expect(screen.getByTestId("board-picker")).toHaveTextContent("South deals");
    expect(screen.getByTestId("board-picker")).toHaveTextContent("E-W Vul");
  });

  it("keeps the sixteen numbers folded away", () => {
    render(<BoardPicker boardNumber={1} onSelect={vi.fn()} />);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getAllByRole("radio")).toHaveLength(16);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("picks the board that is tapped, with no swipe involved", () => {
    // A mouse has no flick, and scrolling the strip is not animated
    // everywhere, so the chip has to select on its own.
    const onSelect = vi.fn();
    render(<BoardPicker boardNumber={1} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.click(screen.getByRole("radio", { name: "Board 9" }));
    expect(onSelect).toHaveBeenCalledWith(9);
  });

  it("does not re-select the board already being explored", () => {
    const onSelect = vi.fn();
    render(<BoardPicker boardNumber={4} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.click(screen.getByRole("radio", { name: "Board 4" }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("says how the strip is worked", () => {
    render(<BoardPicker boardNumber={1} onSelect={vi.fn()} />);
    expect(screen.queryByText(/Tap a number/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByText("Tap a number, or swipe the strip.")).toBeVisible();
  });

  it("marks the board being explored", () => {
    render(<BoardPicker boardNumber={7} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByRole("radio", { name: "Board 7" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Board 8" })).not.toBeChecked();
  });
});
