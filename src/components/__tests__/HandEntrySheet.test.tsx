import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HandEntrySheet, SLIDE_MS } from "../HandEntrySheet";
import { handFromCdhsString, handToCdhsString } from "../../bridge";
import { emptyEntry, entryFromHand } from "../../bridge/hand-entry";

function tap(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

function suitTab(name: string) {
  return screen.getByRole("button", { name });
}

function doneButton() {
  return screen.getByRole("button", { name: "Done" });
}

/** The sheet slides away before it reports. */
function slide() {
  act(() => {
    vi.advanceTimersByTime(SLIDE_MS);
  });
}

function renderSheet(
  props: Partial<Parameters<typeof HandEntrySheet>[0]> = {},
) {
  const handlers = {
    onDone: vi.fn(),
    onCancel: vi.fn(),
    onForget: vi.fn(),
  };
  render(
    <HandEntrySheet
      seatName="South"
      initial={emptyEntry()}
      editing={false}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

/** ♠AQ982 ♥K5 ♦A973 ♣42 in eight taps. */
function enterOpener() {
  tap("A of spades");
  tap("Q of spades");
  tap("3 small cards");
  tap("K of hearts");
  tap("1 small card");
  tap("A of diamonds");
  tap("3 small cards");
  tap("2 small cards");
}

describe("HandEntrySheet", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("enters a hand in eight taps and waits for Done", () => {
    const { onDone } = renderSheet();
    expect(suitTab("Spades")).toHaveAttribute("aria-current", "true");
    expect(doneButton()).toBeDisabled();
    tap("A of spades");
    tap("Q of spades");
    tap("3 small cards");
    // The first small cards of a suit move the entry on to hearts.
    expect(suitTab("Hearts")).toHaveAttribute("aria-current", "true");
    tap("K of hearts");
    tap("1 small card");
    tap("A of diamonds");
    tap("3 small cards");
    expect(suitTab("Clubs")).toHaveAttribute("aria-current", "true");
    tap("2 small cards");

    // Thirteen cards: nothing closes until the player says so.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onDone).not.toHaveBeenCalled();
    expect(doneButton()).toBeEnabled();
    fireEvent.click(doneButton());
    slide();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(handToCdhsString(onDone.mock.calls[0][0])).toBe("32.A432.K2.AQ432");
  });

  it("holds the small cards up to the one tapped", () => {
    renderSheet();
    tap("4 small cards");
    fireEvent.click(suitTab("Spades"));
    const row = screen.getByTestId("small-cards");
    const pressed = [...row.querySelectorAll("button")].map(
      (b) => b.getAttribute("aria-pressed") === "true",
    );
    expect(pressed).toEqual([
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
    // No digit anywhere on the row: it cannot be mistaken for a rank.
    expect(row.textContent).not.toMatch(/\d/);
  });

  it("gives back the last small card when it is tapped again", () => {
    renderSheet({ editing: true });
    tap("2 small cards");
    tap("2 small cards");
    expect(
      screen.getByRole("button", { name: "1 small card" }),
    ).toHaveAttribute("aria-pressed", "true");
    tap("1 small card");
    expect(
      screen.getByRole("button", { name: "1 small card" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("shows what has been entered, small cards as blanks of their suit", () => {
    renderSheet();
    tap("A of spades");
    tap("4 small cards");
    const fan = screen.getByTestId("entry-fan");
    const spades = fan.querySelector('[aria-label="Spades"]')!;
    expect(spades.querySelectorAll('[data-testid="mini-card"]')).toHaveLength(
      5,
    );
    expect(spades.textContent).toBe("A♠" + "♠♠".repeat(4));
  });

  it("goes back to a suit tapped in the fan", () => {
    renderSheet();
    tap("2 small cards");
    fireEvent.click(suitTab("Spades"));
    expect(suitTab("Spades")).toHaveAttribute("aria-current", "true");
    expect(
      screen.getByRole("button", { name: "2 small cards" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("takes a card too many, and holds Done back until the suit is fixed", () => {
    const { onDone } = renderSheet();
    tap("A of spades");
    tap("Q of spades");
    tap("4 small cards");
    tap("K of hearts");
    tap("1 small card");
    tap("A of diamonds");
    tap("3 small cards");
    tap("2 small cards");
    expect(screen.getByTestId("miscount").textContent).toBe(
      "14 cards, one too many",
    );
    expect(doneButton()).toBeDisabled();
    expect(screen.getAllByTestId("mini-card")).toHaveLength(14);

    fireEvent.click(suitTab("Spades"));
    tap("3 small cards");
    expect(screen.queryByTestId("miscount")).toBeNull();
    fireEvent.click(doneButton());
    slide();
    expect(handToCdhsString(onDone.mock.calls[0][0])).toBe("32.A432.K2.AQ432");
  });

  it("says when every suit is counted and cards are missing", () => {
    renderSheet();
    tap("3 small cards");
    tap("3 small cards");
    tap("3 small cards");
    tap("3 small cards");
    expect(screen.getByTestId("miscount").textContent).toBe(
      "12 cards, one short",
    );
    expect(doneButton()).toBeDisabled();
  });

  it("takes a suit never given small cards as void", () => {
    const { onDone } = renderSheet();
    tap("7 small cards");
    tap("A of hearts");
    tap("4 small cards");
    tap("A of diamonds");
    fireEvent.click(doneButton());
    slide();
    expect(handToCdhsString(onDone.mock.calls[0][0])).toBe(".A.A5432.8765432");
  });

  it("confirms a whole hand with Enter", () => {
    const { onDone } = renderSheet();
    enterOpener();
    fireEvent.keyDown(window, { key: "Enter" });
    slide();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("ignores Enter until the hand is whole", () => {
    const { onDone } = renderSheet();
    tap("A of spades");
    fireEvent.keyDown(window, { key: "Enter" });
    slide();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("hands back an unfinished entry when dismissed", () => {
    const { onCancel, onDone } = renderSheet();
    tap("K of spades");
    tap("Cancel");
    slide();
    expect(onDone).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCancel.mock.calls[0][0].S).toEqual({ honors: ["K"], small: null });
  });

  it("is dismissed by Escape", () => {
    const { onCancel } = renderSheet();
    fireEvent.keyDown(window, { key: "Escape" });
    slide();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("is dismissed by tapping outside it", () => {
    const { onCancel } = renderSheet();
    fireEvent.click(screen.getByTestId("sheet-scrim"));
    slide();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  describe("editing a finished hand", () => {
    const hand = handFromCdhsString("42.A973.K5.AQ982")!;

    it("stays on its suit and saves the change on Done", () => {
      const { onDone } = renderSheet({
        initial: entryFromHand(hand),
        editing: true,
      });
      expect(doneButton()).toBeEnabled();
      // Swap the spade queen for the king.
      tap("Q of spades");
      expect(doneButton()).toBeDisabled();
      tap("K of spades");
      expect(suitTab("Spades")).toHaveAttribute("aria-current", "true");
      fireEvent.click(doneButton());
      slide();
      expect(handToCdhsString(onDone.mock.calls[0][0])).toBe(
        "32.A432.K2.AK432",
      );
    });

    it("can forget the hand", () => {
      const { onForget, onDone } = renderSheet({
        initial: entryFromHand(hand),
        editing: true,
      });
      tap("Forget");
      slide();
      expect(onForget).toHaveBeenCalledTimes(1);
      expect(onDone).not.toHaveBeenCalled();
    });
  });

  it("offers Forget only when editing", () => {
    renderSheet({ onForget: undefined });
    expect(screen.queryByRole("button", { name: "Forget" })).toBeNull();
  });
});
