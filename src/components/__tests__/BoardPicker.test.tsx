import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BoardPicker } from "../BoardPicker";

describe("BoardPicker", () => {
  it("says what the board decides, in one line", () => {
    render(<BoardPicker boardNumber={3} onSelect={vi.fn()} />);
    // Board 3 is South's deal with East-West vulnerable, and those are the
    // only two things the number is worth knowing for.
    expect(screen.getByTestId("board-picker")).toHaveTextContent("South deals");
    expect(screen.getByTestId("board-picker")).toHaveTextContent("E-W Vul");
  });

  it("offers the sixteen boards of a round", () => {
    render(<BoardPicker boardNumber={1} onSelect={vi.fn()} />);
    expect(screen.getAllByRole("option")).toHaveLength(16);
  });

  it("shows the board being explored", () => {
    render(<BoardPicker boardNumber={7} onSelect={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Board number" })).toHaveValue(
      "7",
    );
  });

  it("selects the board that is chosen", () => {
    const onSelect = vi.fn();
    render(<BoardPicker boardNumber={1} onSelect={onSelect} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Board number" }), {
      target: { value: "9" },
    });
    expect(onSelect).toHaveBeenCalledWith(9);
  });
});
