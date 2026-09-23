import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement as h } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { ExplorePage } from "../ExplorePage";
import { HandEntrySheet } from "../../components/HandEntrySheet";
import { handFromCdhsString } from "../../bridge";
import { saveHands } from "../../bridge/entered-hands";
import { entryFromHand } from "../../bridge/hand-entry";
import "../../index.css";

/** The narrowest phone the page is laid out for: an iPhone SE or mini. */
const PHONE = { width: 375, height: 667 };

/** ♠AQ1098 ♥K5 ♦A1073 ♣42: 13 hcp, opens 1♠; its tens test the fan. */
const OPENER = handFromCdhsString("42.AT73.K5.AQT98")!;

let root: Root | undefined;
let phone: HTMLElement | undefined;

afterEach(() => {
  root?.unmount();
  phone?.remove();
  root = undefined;
  phone = undefined;
  sessionStorage.clear();
});

/**
 * A phone-sized box. Its transform makes it the containing block of the
 * entry sheet, which is fixed to the screen, so the sheet is phone-sized too.
 */
function renderInPhone(element: ReturnType<typeof h>) {
  phone = document.createElement("div");
  phone.style.width = `${PHONE.width}px`;
  phone.style.height = `${PHONE.height}px`;
  phone.style.overflowY = "auto";
  phone.style.transform = "translateZ(0)";
  document.body.style.margin = "0";
  document.body.append(phone);
  root = createRoot(phone);
  flushSync(() => root!.render(element));
}

function find<T extends Element = HTMLElement>(selector: string): T {
  const element = phone!.querySelector<T>(selector);
  if (!element) throw new Error(`nothing matches ${selector}`);
  return element;
}

function button(name: string): HTMLButtonElement {
  const match = [...phone!.querySelectorAll("button")].find(
    (b) => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === name,
  );
  if (!match) throw new Error(`no button ${name}`);
  return match;
}

function fits(element: Element) {
  expect(element.getBoundingClientRect().width).toBeGreaterThan(0);
  expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth);
}

describe("Explore at the table", () => {
  it("weighs the real engine's calls against an entered hand, on a phone", async () => {
    saveHands({ N: OPENER });
    const router = createMemoryRouter(
      [{ path: "/explore/:exploreId", element: h(ExplorePage) }],
      { initialEntries: ["/explore/1"] },
    );
    renderInPhone(h(RouterProvider, { router }));

    await vi.waitFor(() => find('[data-testid="call-row-1S"]'), {
      timeout: 60_000,
      interval: 100,
    });

    // The board line and both of its actions on one line, inside the phone.
    fits(document.documentElement);
    fits(find('[data-testid="call-table"]'));
    const next = button("Next board");
    expect(next.getBoundingClientRect().height).toBeLessThanOrEqual(40);
    expect(
      Math.abs(
        next.getBoundingClientRect().top -
          button("Restart this board").getBoundingClientRect().top,
      ),
    ).toBeLessThan(1);

    // Nothing in the bar runs into anything else.
    const line = [...phone!.querySelectorAll("span")].find((span) =>
      span.textContent?.startsWith("North deals"),
    )!;
    expect(line.getBoundingClientRect().right).toBeLessThanOrEqual(
      button("Restart this board").getBoundingClientRect().left,
    );

    // Face down, the menu says nothing about the hand.
    expect(phone!.querySelector("[data-fit]")).toBeNull();
    button("Show North's hand").click();

    await vi.waitFor(
      () => {
        const chosen = find('[data-fit="chosen"]');
        expect(chosen.dataset.testid).toBe("call-row-1S");
      },
      { timeout: 60_000, interval: 100 },
    );
    expect(find('[data-testid="call-row-1S"]').textContent).toContain(
      "You have 13 hcp and 5 ♠.",
    );
    expect(find('[data-testid="call-row-1N"]').dataset.fit).toBe("unfit");
    expect(find('[data-testid="call-row-1N"]').textContent).toContain(
      "Needs 15–17 hcp, you have 13.",
    );
    expect(find('[data-testid="call-row-P"]').textContent).toContain(
      "SAYC prefers 1♠",
    );
    // All thirteen cards on one line, each rank clear of the card over it.
    const hand = find('[data-testid="hand-N"]');
    fits(hand);
    const cards = [...hand.querySelectorAll('[data-testid="mini-card"]')];
    expect(cards).toHaveLength(13);
    expect(
      new Set(cards.map((card) => card.getBoundingClientRect().top)).size,
    ).toBe(1);
    for (let i = 0; i + 1 < cards.length; i++) {
      const rank = cards[i].firstElementChild!.getBoundingClientRect();
      const over = cards[i + 1].getBoundingClientRect();
      if (over.left > rank.left) {
        // A text box runs a hair past its ink.
        expect(rank.right).toBeLessThanOrEqual(over.left + 1);
      }
    }
  });
});

describe("HandEntrySheet on a phone", () => {
  function renderSheet(cdhs: string) {
    renderInPhone(
      h(HandEntrySheet, {
        seatName: "South",
        initial: entryFromHand(handFromCdhsString(cdhs)!),
        editing: true,
        onDone: () => {},
        onCancel: () => {},
      }),
    );
  }

  it("fans even a two-suited hand with two voids across the sheet", () => {
    renderSheet("..AKQ432.AKQJT98");
    const fan = find('[data-testid="entry-fan"]');
    fits(fan);
    const sheet = find('[data-testid="hand-entry"]');
    expect(
      fan.lastElementChild!.getBoundingClientRect().right,
    ).toBeLessThanOrEqual(sheet.getBoundingClientRect().right);
  });

  it("gives every key a thumb's width, all inside the sheet", async () => {
    renderSheet("42.A973.K5.AQ982");
    // The keys deal in from a smaller scale: measure them where they land.
    await Promise.all(document.getAnimations().map((a) => a.finished));
    const sheet = find('[data-testid="hand-entry"]').getBoundingClientRect();
    expect(sheet.width).toBe(PHONE.width);
    const keys = [
      ...phone!.querySelectorAll<HTMLButtonElement>("button[aria-label]"),
    ].filter((b) =>
      /small cards?$| of spades$/.test(b.getAttribute("aria-label")!),
    );
    expect(keys).toHaveLength(13);
    for (const key of keys) {
      const box = key.getBoundingClientRect();
      expect(box.width).toBeGreaterThanOrEqual(32);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.left).toBeGreaterThanOrEqual(sheet.left);
      expect(box.right).toBeLessThanOrEqual(sheet.right);
    }
  });
});
