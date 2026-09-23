import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SeatHand } from "../SeatHand";
import { handFromCdhsString } from "../../bridge";

const HAND = handFromCdhsString("42.A973.K5.AQ982")!;

function renderSeat(props: Partial<Parameters<typeof SeatHand>[0]> = {}) {
  const handlers = {
    onEnter: vi.fn(),
    onShow: vi.fn(),
    onHide: vi.fn(),
    onEdit: vi.fn(),
  };
  render(<SeatHand seat="S" shown={false} {...handlers} {...props} />);
  return handlers;
}

describe("SeatHand", () => {
  it("invites the seat to enter its hand", () => {
    const { onEnter } = renderSeat();
    fireEvent.click(screen.getByRole("button", { name: /Enter South's hand/ }));
    expect(onEnter).toHaveBeenCalled();
  });

  it("shows only the backs of an entered hand until asked", () => {
    const { onShow } = renderSeat({ hand: HAND });
    expect(screen.queryAllByTestId("mini-card")).toHaveLength(0);
    expect(screen.queryByText("A")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show South's hand" }));
    expect(onShow).toHaveBeenCalled();
  });

  it("fans a shown hand with quiet Edit and Hide", () => {
    const { onHide, onEdit } = renderSeat({ hand: HAND, shown: true });
    expect(screen.getAllByTestId("mini-card")).toHaveLength(13);
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onHide).toHaveBeenCalled();
    expect(onEdit).toHaveBeenCalled();
  });

  it("says when the engine is still weighing the calls", () => {
    renderSeat({ hand: HAND, shown: true, weighing: true });
    expect(screen.getByText("Weighing the calls…")).toBeTruthy();
  });
});
