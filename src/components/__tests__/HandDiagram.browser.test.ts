import { describe, expect, it, afterEach } from "vitest";
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { HandDiagram } from "../HandDiagram";
import {
  MOCK_DEAL,
  MOCK_LONG_SUIT_DEAL,
  MOCK_VOID_DEAL,
} from "../../bridge/mock";
import type { Deal, Position } from "../../bridge/types";
import type { DoubleDummyTable } from "../../dds/dds-core";
import "../../index.css";

let root: Root | undefined;
let container: HTMLElement | undefined;

afterEach(() => {
  root?.unmount();
  container?.remove();
  root = undefined;
  container = undefined;
});

/** The narrowest column the diagram is laid out in: an iPhone SE, less padding. */
const NARROW = 375 - 32;

/** A solved table, so the diagram carries everything the review shows. */
const TABLE = Object.fromEntries(
  (["C", "D", "H", "S", "N"] as const).map((strain) => [
    strain,
    { N: 10, E: 3, S: 10, W: 3 },
  ]),
) as DoubleDummyTable;

function renderDiagram(
  deal: Deal,
  {
    width = NARROW,
    ...props
  }: { width?: number; userPosition?: Position } = {},
) {
  container = document.createElement("div");
  container.style.width = `${width}px`;
  document.body.append(container);
  root = createRoot(container);
  flushSync(() =>
    root!.render(
      createElement(HandDiagram, {
        deal,
        table: TABLE,
        boardNumber: 3,
        dealer: "N",
        vulnerability: "NS",
        ...props,
      }),
    ),
  );
}

/** The top of each of a hand's suit lines, relative to the diagram itself. */
function lineTops(position: Position): number[] {
  const origin = container!
    .querySelector('[data-testid="hand-diagram"]')!
    .getBoundingClientRect().top;
  const rows = container!.querySelector(
    `[data-testid="hand-${position}"] [data-testid="suit-rows"]`,
  )!;
  return [...rows.children].map(
    (row) => row.getBoundingClientRect().top - origin,
  );
}

describe("HandDiagram layout", () => {
  it("keeps West's and East's suits on the same lines, void or not", () => {
    renderDiagram(MOCK_VOID_DEAL);

    // A zero height here would mean Tailwind never loaded and the
    // measurements below say nothing.
    const west = lineTops("W");
    expect(west[0]).toBeGreaterThan(0);
    expect(west).toHaveLength(4);
    expect(new Set(west).size).toBe(4);
    // West is void in hearts: the line stays, so the suits below it do not
    // move up out of step with East's.
    expect(lineTops("E")).toEqual(west);

    renderDiagram(MOCK_DEAL);
    expect(lineTops("E")).toEqual(lineTops("W"));

    // A long suit wrapped in the width a phone leaves a seat, and the three
    // suits under it dropped a line, leaving East reading a suit lower than
    // West all the way down.
    renderDiagram(MOCK_LONG_SUIT_DEAL, { userPosition: "S" });
    expect(lineTops("E")).toEqual(lineTops("W"));
  });

  it("gives a holding one line, however long the suit", () => {
    renderDiagram(MOCK_LONG_SUIT_DEAL, { userPosition: "S" });
    // Every holding of the deal, from a void to eight spades, stands the
    // same height: a wrapped one would be twice the others.
    const heights = new Set(
      [...container!.querySelectorAll('[data-testid^="suit-line-"]')].map(
        (line) => line.getBoundingClientRect().height.toFixed(2),
      ),
    );
    expect(heights.size).toBe(1);
    expect([...heights][0]).not.toBe("0.00");
  });

  it("keeps the longest holdings inside the card", () => {
    // Unwrapped, a long holding asks its column for the room it needs, and
    // the seats to either side have to give it: the diagram is the width of
    // a phone and cannot grow.
    // The seat that names the user carries the widest label of the four,
    // and North's says "(you)" over twenty-nine points: it is the line most
    // able to crowd the long holdings to either side of it.
    renderDiagram(MOCK_LONG_SUIT_DEAL, { userPosition: "N" });
    const diagram = container!.querySelector('[data-testid="hand-diagram"]')!;
    expect(diagram.scrollWidth).toBeLessThanOrEqual(diagram.clientWidth);
    // The card's own padding, which the hands stay inside of.
    const box = diagram.getBoundingClientRect();
    const inset = Number.parseFloat(getComputedStyle(diagram).paddingRight);
    expect(inset).toBeGreaterThan(0);
    for (const position of ["N", "E", "S", "W"] as Position[]) {
      const hand = container!
        .querySelector(`[data-testid="hand-${position}"]`)!
        .getBoundingClientRect();
      expect(hand.left).toBeGreaterThanOrEqual(box.left + inset - 0.5);
      expect(hand.right).toBeLessThanOrEqual(box.right - inset + 0.5);
    }
  });

  it("lines a hand's ranks up in columns down its four suits", () => {
    renderDiagram(MOCK_DEAL);
    // The page's font is not monospaced — its J is 4px wide against its
    // Q's 11 — so every rank sits in a box of one width, and the cards of
    // a hand read down its four suits as columns.
    for (const position of ["N", "E", "S", "W"] as Position[]) {
      const hand = container!.querySelector(
        `[data-testid="hand-${position}"]`,
      )!;
      const lines = [...hand.querySelectorAll('[data-testid^="suit-line-"]')];
      expect(lines).toHaveLength(4);

      const widths = new Set<string>();
      const pitches = new Set<string>();
      const firstRank = new Set<string>();
      for (const line of lines) {
        // A suit's box, then one box per card: a holding rendered as a
        // single run of text would leave a line with two children.
        const cells = [...line.children];
        expect(cells.length).toBe(1 + (line.textContent!.length - 1));
        const ranks = cells
          .slice(1)
          .map((cell) => cell.getBoundingClientRect());
        firstRank.add(ranks[0].left.toFixed(2));
        for (const [i, rank] of ranks.entries()) {
          widths.add(rank.width.toFixed(2));
          if (i > 0) pitches.add((rank.left - ranks[i - 1].left).toFixed(2));
        }
      }
      // A zero width here would mean Tailwind never loaded.
      expect([...widths][0]).not.toBe("0.00");
      expect(widths.size).toBe(1);
      expect(pitches.size).toBe(1);
      expect(firstRank.size).toBe(1);
    }
  });

  it("puts North and South on one left edge, between West and East", () => {
    renderDiagram(MOCK_DEAL);
    const left = (position: Position) =>
      container!
        .querySelector(`[data-testid="hand-${position}"]`)!
        .getBoundingClientRect().left;
    // Centred separately, the two hands landed at two edges, since each
    // block is only as wide as its own longest holding.
    expect(left("N")).toBe(left("S"));
    expect(left("W")).toBeLessThan(left("N"));
    expect(left("E")).toBeGreaterThan(left("N"));
  });

  it("gives every rank a box it fits inside", () => {
    renderDiagram(MOCK_DEAL);
    // A rank wider than its box spills over both edges and crowds the card
    // beside it: at 0.72em a Q did, and a Q before a 9 read as tight. The
    // widest rank is measured in the browser's own font rather than
    // assumed, since the page names no font of its own.
    const ruler = document.createElement("span");
    ruler.style.display = "inline-block";
    container!.querySelector('[data-testid="hand-N"]')!.append(ruler);
    let widest = 0;
    for (const rank of "AKQJT98765432") {
      ruler.textContent = rank;
      widest = Math.max(widest, ruler.getBoundingClientRect().width);
    }
    ruler.remove();
    expect(widest).toBeGreaterThan(0);

    const cell = container!
      .querySelector('[data-testid="suit-line-S"] span:nth-child(2)')!
      .getBoundingClientRect().width;
    expect(cell).toBeGreaterThan(widest);
  });

  it("holds no holding outside its column", () => {
    // Thirteen ranks have to fit a third of a phone's width. The void deal
    // has six cards with two tens; the long-suit deal has eight.
    for (const deal of [MOCK_DEAL, MOCK_VOID_DEAL, MOCK_LONG_SUIT_DEAL]) {
      renderDiagram(deal, { userPosition: "S" });
      for (const line of container!.querySelectorAll(
        '[data-testid^="suit-line-"]',
      )) {
        expect(line.scrollWidth).toBeLessThanOrEqual(line.clientWidth + 1);
      }
    }
  });

  it("stands a fraction of a phone screen tall", () => {
    // The same four hands as fanned cards stood 708px tall, most of a
    // phone screen, and pushed the review's buttons out of reach. As text,
    // with the board and each side's points in the room a cross leaves
    // empty, the whole deal takes little more than a third of that.
    renderDiagram(MOCK_DEAL);
    const height = container!
      .querySelector('[data-testid="hand-diagram"]')!
      .getBoundingClientRect().height;
    expect(height).toBeGreaterThan(0);
    expect(height).toBeLessThan(400);
  });
});
