import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FINISH_DELAY_MS, HandEntrySheet, SLIDE_MS } from "../HandEntrySheet";
import { handFromCdhsString, handToCdhsString } from "../../bridge";
import { emptyEntry, entryFromHand } from "../../bridge/hand-entry";

/** A key: an honor is a button, a count is one choice of a selector. */
function key(name: string) {
  return (
    screen.queryByRole("radio", { name }) ??
    screen.getByRole("button", { name })
  );
}

function tap(name: string) {
  fireEvent.click(key(name));
}

function suitTab(name: string) {
  return screen.getByRole("button", { name });
}

/** The whole hand stays in view a moment, then the sheet slides away. */
function finish() {
  act(() => {
    vi.advanceTimersByTime(FINISH_DELAY_MS);
  });
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

describe("HandEntrySheet", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("enters a hand in eight taps and closes itself on the thirteenth card", () => {
    const { onDone } = renderSheet();
    expect(suitTab("Spades")).toHaveAttribute("aria-current", "true");
    tap("A of spades");
    tap("Q of spades");
    tap("3 small cards");
    // The count moves the entry on to hearts.
    expect(suitTab("Hearts")).toHaveAttribute("aria-current", "true");
    tap("K of hearts");
    tap("1 small card");
    tap("A of diamonds");
    tap("3 small cards");
    expect(suitTab("Clubs")).toHaveAttribute("aria-current", "true");
    tap("2 small cards");

    expect(onDone).not.toHaveBeenCalled();
    finish();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(handToCdhsString(onDone.mock.calls[0][0])).toBe("32.A432.K2.AQ432");
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
    expect(key("2 small cards")).toHaveAttribute("aria-checked", "true");
  });

  it("takes a card too many, and stays open until the suit is fixed", () => {
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
    act(() => {
      vi.advanceTimersByTime(FINISH_DELAY_MS + SLIDE_MS);
    });
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getAllByTestId("mini-card")).toHaveLength(14);

    fireEvent.click(suitTab("Spades"));
    tap("3 small cards");
    expect(screen.queryByTestId("miscount")).toBeNull();
    finish();
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
  });

  it("waits for voids to be counted before closing", () => {
    const { onDone } = renderSheet();
    tap("7 small cards");
    tap("A of hearts");
    tap("5 small cards");
    finish();
    expect(onDone).not.toHaveBeenCalled();
    expect(suitTab("Diamonds")).toHaveAttribute("aria-current", "true");
    tap("0 small cards");
    tap("0 small cards");
    finish();
    expect(handToCdhsString(onDone.mock.calls[0][0])).toBe("..A65432.8765432");
  });

  it("hands back an unfinished entry when dismissed", () => {
    const { onCancel, onDone } = renderSheet();
    tap("K of spades");
    tap("Cancel");
    act(() => {
      vi.advanceTimersByTime(SLIDE_MS);
    });
    expect(onDone).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCancel.mock.calls[0][0].S).toEqual({ honors: ["K"], small: null });
  });

  it("is dismissed by Escape", () => {
    const first = renderSheet();
    fireEvent.keyDown(window, { key: "Escape" });
    act(() => {
      vi.advanceTimersByTime(SLIDE_MS);
    });
    expect(first.onCancel).toHaveBeenCalledTimes(1);
  });

  it("is dismissed by tapping outside it", () => {
    const { onCancel } = renderSheet();
    fireEvent.click(screen.getByTestId("sheet-scrim"));
    act(() => {
      vi.advanceTimersByTime(SLIDE_MS);
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  describe("editing a finished hand", () => {
    const hand = handFromCdhsString("42.A973.K5.AQ982")!;

    it("stays on its suit and closes when the hand is whole again", () => {
      const { onDone } = renderSheet({
        initial: entryFromHand(hand),
        editing: true,
      });
      // Swap the spade queen for the king.
      tap("Q of spades");
      expect(onDone).not.toHaveBeenCalled();
      tap("K of spades");
      expect(suitTab("Spades")).toHaveAttribute("aria-current", "true");
      finish();
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
      act(() => {
        vi.advanceTimersByTime(SLIDE_MS);
      });
      expect(onForget).toHaveBeenCalledTimes(1);
      expect(onDone).not.toHaveBeenCalled();
    });
  });

  it("offers Forget only when editing", () => {
    renderSheet({ onForget: undefined });
    expect(screen.queryByRole("button", { name: "Forget" })).toBeNull();
  });
});
