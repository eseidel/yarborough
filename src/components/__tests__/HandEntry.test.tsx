import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { HandEntry } from "../HandEntry";
import { handFromCdhsString } from "../../bridge/types";

const OPENER = "42.A973.K5.AQ982";

/** The thirteen cards of OPENER, in the order the fan draws them. */
const OPENER_KEYS = [
  "SA",
  "SQ",
  "S9",
  "S8",
  "S2",
  "HK",
  "H5",
  "DA",
  "D9",
  "D7",
  "D3",
  "C4",
  "C2",
];

function renderEntry(props: Partial<Parameters<typeof HandEntry>[0]> = {}) {
  const onDone = vi.fn();
  const onCancel = vi.fn();
  render(
    <HandEntry position="W" onDone={onDone} onCancel={onCancel} {...props} />,
  );
  return { onDone, onCancel };
}

function rank(suit: string, value: string): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>(
    `[data-card="${suit}${value}"]`,
  )!;
}

/** A tap: the grid takes cards on pointer down, as a drag's first cell does. */
function tap(cell: HTMLElement) {
  fireEvent.pointerDown(cell, { clientX: 0, clientY: 0, pointerId: 1 });
  fireEvent.pointerUp(cell, { clientX: 0, clientY: 0, pointerId: 1 });
}

describe("HandEntry", () => {
  it("offers every card of the deck, suits down and ranks across", () => {
    renderEntry();
    for (const suit of ["S", "H", "D", "C"]) {
      const row = screen.getByTestId(`rank-row-${suit}`);
      expect(within(row).getAllByRole("button")).toHaveLength(13);
    }
    expect(document.querySelectorAll("[data-card]")).toHaveLength(52);
    // Ace first, two last: the order they lie in the fan.
    const spades = within(screen.getByTestId("rank-row-S")).getAllByRole(
      "button",
    );
    expect(spades[0]).toHaveTextContent("A");
    expect(spades[12]).toHaveTextContent("2");
  });

  it("shows no count and no point total", () => {
    renderEntry({ initialHand: handFromCdhsString(OPENER)! });
    // The fan is the feedback; a tally would be something else to read.
    expect(screen.queryByText(/13 of 13/)).toBeNull();
    expect(screen.queryByText(/\bHCP\b/i)).toBeNull();
    expect(screen.queryByText(/points/i)).toBeNull();
  });

  it("builds the fan as cards are taken", () => {
    renderEntry();
    expect(screen.getByTestId("entry-fan")).toHaveTextContent(/builds here/i);
    tap(rank("S", "A"));
    expect(screen.getByTestId("fan-card-SA")).toBeInTheDocument();
    expect(rank("S", "A")).toHaveAttribute("aria-pressed", "true");
  });

  it("puts a card back when it is tapped again", () => {
    renderEntry();
    tap(rank("H", "K"));
    expect(screen.getByTestId("fan-card-HK")).toBeInTheDocument();
    tap(rank("H", "K"));
    expect(screen.queryByTestId("fan-card-HK")).toBeNull();
  });

  it("stops at thirteen cards instead of counting them out", () => {
    renderEntry({ initialHand: handFromCdhsString(OPENER)! });
    // Every card the hand does not hold is refused, which is what tells a
    // player still holding one that they have miscounted.
    expect(rank("C", "A")).toBeDisabled();
    expect(rank("S", "A")).not.toBeDisabled();
    tap(rank("C", "A"));
    expect(screen.queryByTestId("fan-card-CA")).toBeNull();
  });

  it("finishes itself on the thirteenth card", () => {
    const { onDone } = renderEntry();
    for (const key of OPENER_KEYS.slice(0, 12)) tap(rank(key[0], key[1]));
    expect(onDone).not.toHaveBeenCalled();
    tap(rank("C", "2"));
    expect(onDone).toHaveBeenCalledTimes(1);
    const hand = onDone.mock.calls[0][0];
    expect(
      hand.cards.map(
        (card: { suit: string; rank: string }) => card.suit + card.rank,
      ),
    ).toEqual(OPENER_KEYS);
  });

  it("does not finish a hand it was opened on, so a card can be corrected", () => {
    // Coming back to fix a card: thirteen cards are already there, and the
    // sheet closing on sight would make the correction impossible.
    const { onDone } = renderEntry({
      initialHand: handFromCdhsString(OPENER)!,
    });
    expect(onDone).not.toHaveBeenCalled();
    // Take one out and put another in: that completes the hand, and closes.
    fireEvent.keyDown(screen.getByTestId("fan-card-C2"), { key: "Backspace" });
    expect(onDone).not.toHaveBeenCalled();
    tap(rank("C", "3"));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("flicks a card up out of the fan", () => {
    renderEntry({ initialHand: handFromCdhsString(OPENER)! });
    const card = screen.getByTestId("fan-card-SA");
    fireEvent.pointerDown(card, { clientX: 20, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(card, { clientX: 20, clientY: 60, pointerId: 1 });
    fireEvent.pointerUp(card, { clientX: 20, clientY: 60, pointerId: 1 });
    expect(screen.queryByTestId("fan-card-SA")).toBeNull();
    expect(rank("S", "A")).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps a card that was only nudged", () => {
    renderEntry({ initialHand: handFromCdhsString(OPENER)! });
    const card = screen.getByTestId("fan-card-SA");
    fireEvent.pointerDown(card, { clientX: 20, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(card, { clientX: 20, clientY: 92, pointerId: 1 });
    fireEvent.pointerUp(card, { clientX: 20, clientY: 92, pointerId: 1 });
    expect(screen.getByTestId("fan-card-SA")).toBeInTheDocument();
  });

  it("starts from the hand it is correcting", () => {
    renderEntry({ initialHand: handFromCdhsString(OPENER)! });
    expect(screen.getAllByTestId(/^fan-card-/)).toHaveLength(13);
  });

  it("names the seat it is asking about, and nothing else", () => {
    renderEntry({ position: "N" });
    expect(screen.getByText("North")).toBeInTheDocument();
    // The thirteenth card finishes the hand, so there is nothing to confirm.
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
    expect(screen.queryByText(/Your cards/i)).toBeNull();
  });

  it("gets out of the way from the corner, like the open hand", () => {
    const { onCancel } = renderEntry();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
