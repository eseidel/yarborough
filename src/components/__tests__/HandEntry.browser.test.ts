import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { HandEntry } from "../HandEntry";
import { handFromCdhsString } from "../../bridge/types";
import "../../index.css";

let root: Root | undefined;
let container: HTMLElement | undefined;

afterEach(() => {
  root?.unmount();
  container?.remove();
  root = undefined;
  container = undefined;
});

/** The column the entry is laid out in on an iPhone 15 or 16, less the page's padding. */
const IPHONE = 393 - 32;

/** The same on the narrowest phone the app is designed for, an iPhone SE. */
const SE = 375 - 32;

function renderEntry(width = IPHONE, hand?: string) {
  container = document.createElement("div");
  container.style.width = `${width}px`;
  document.body.append(container);
  root = createRoot(container);
  flushSync(() => {
    root!.render(
      createElement(HandEntry, {
        position: "W",
        initialHand: hand ? handFromCdhsString(hand)! : undefined,
        onDone: () => {},
        onCancel: () => {},
      }),
    );
  });
}

function cell(card: string): HTMLButtonElement {
  return container!.querySelector<HTMLButtonElement>(`[data-card="${card}"]`)!;
}

function centreOf(element: Element): { x: number; y: number } {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

function pointer(
  type: string,
  target: Element,
  at: { x: number; y: number },
): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      clientX: at.x,
      clientY: at.y,
    }),
  );
}

/**
 * Let React paint what the stroke did.
 *
 * `pointermove` is a continuous event, so React batches the updates it makes
 * rather than flushing them before the next line of the test.
 */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("taking cards by dragging", () => {
  it("takes every rank the finger crosses", async () => {
    renderEntry();
    const grid = container!.querySelector('[data-testid="rank-grid"]')!;
    // A stroke from the king of spades to the nine: KQJT9, one movement.
    const from = centreOf(cell("SK"));
    const to = centreOf(cell("S9"));
    pointer("pointerdown", cell("SK"), from);
    for (const card of ["SQ", "SJ", "ST", "S9"]) {
      pointer("pointermove", grid, centreOf(cell(card)));
    }
    pointer("pointerup", grid, to);
    await settle();

    for (const card of ["SK", "SQ", "SJ", "ST", "S9"]) {
      expect(cell(card).getAttribute("aria-pressed"), card).toBe("true");
    }
    expect(cell("SA").getAttribute("aria-pressed")).toBe("false");
    expect(cell("S8").getAttribute("aria-pressed")).toBe("false");
    expect(
      container!.querySelectorAll('[data-testid^="fan-card-"]'),
    ).toHaveLength(5);
  });

  it("puts back every rank a second stroke crosses", async () => {
    renderEntry();
    const grid = container!.querySelector('[data-testid="rank-grid"]')!;
    const stroke = (cards: string[]) => {
      pointer("pointerdown", cell(cards[0]), centreOf(cell(cards[0])));
      for (const card of cards.slice(1)) {
        pointer("pointermove", grid, centreOf(cell(card)));
      }
      pointer("pointerup", grid, centreOf(cell(cards[cards.length - 1])));
    };
    stroke(["HA", "HK", "HQ"]);
    await settle();
    expect(cell("HK").getAttribute("aria-pressed")).toBe("true");
    // The first card decides what the stroke does, so a stroke that starts on
    // a card already held puts that run back.
    stroke(["HA", "HK", "HQ"]);
    await settle();
    expect(cell("HA").getAttribute("aria-pressed")).toBe("false");
    expect(cell("HK").getAttribute("aria-pressed")).toBe("false");
    expect(cell("HQ").getAttribute("aria-pressed")).toBe("false");
  });

  it("ends the stroke wherever the finger is lifted", async () => {
    renderEntry();
    const grid = container!.querySelector('[data-testid="rank-grid"]')!;
    pointer("pointerdown", cell("HA"), centreOf(cell("HA")));
    // Lifted off the grid entirely, which is where a capture the browser
    // refused used to leave the stroke running.
    pointer("pointerup", document.body, { x: 5, y: 5 });
    // A move afterwards is not part of any stroke, so it takes nothing.
    pointer("pointermove", grid, centreOf(cell("HK")));
    await settle();
    expect(cell("HA").getAttribute("aria-pressed")).toBe("true");
    expect(cell("HK").getAttribute("aria-pressed")).toBe("false");
  });
});

describe("the room the entry has on a phone", () => {
  it("puts all four suits in under 200px", () => {
    renderEntry();
    const grid = container!.querySelector('[data-testid="rank-grid"]')!;
    // The whole deck, so the auction stays visible above the sheet. Four rows
    // of 46 and three hairline gaps.
    expect(grid.getBoundingClientRect().height).toBeLessThanOrEqual(200);
    for (const suit of ["S", "H", "D", "C"]) {
      const row = container!.querySelector(`[data-testid="rank-row-${suit}"]`)!;
      expect(row.getBoundingClientRect().height).toBe(46);
    }
  });

  it("keeps a rank wide enough to read on the narrowest phone", () => {
    renderEntry(SE);
    const box = cell("ST").getBoundingClientRect();
    // About 24px at 343, once the suit's own column came out of the row and
    // the grid went to the sheet's edges. Narrow, but the row is the target
    // in the axis a thumb is least accurate in, the ranks run in the order
    // everyone already knows, and a wrong card is flicked off the fan.
    expect(box.width).toBeGreaterThan(23);
    expect(box.height).toBe(46);
  });

  it("fits thirteen cards of the fan across without scrolling", () => {
    renderEntry(SE, "42.A973.K5.AQ982");
    const fan = container!.querySelector('[data-testid="entry-fan"]')!;
    expect(fan.scrollWidth).toBeLessThanOrEqual(fan.clientWidth + 1);
    expect(
      container!.querySelectorAll('[data-testid^="fan-card-"]'),
    ).toHaveLength(13);
  });

  it("never scrolls the page sideways", () => {
    renderEntry(SE, "42.A973.K5.AQ982");
    expect(container!.scrollWidth).toBeLessThanOrEqual(
      container!.clientWidth + 1,
    );
  });
});
