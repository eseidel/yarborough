import { describe, expect, it, afterEach } from "vitest";
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { HandDiagram } from "../HandDiagram";
import { MOCK_DEAL, MOCK_VOID_DEAL } from "../../bridge/mock";
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

// N-S make 4♠ and 3NT; E-W make 2♥ and 1♣. Long enough to wrap a line.
const TABLE: DoubleDummyTable = {
  S: { N: 10, E: 3, S: 10, W: 3 },
  H: { N: 5, E: 8, S: 5, W: 8 },
  D: { N: 8, E: 5, S: 8, W: 5 },
  C: { N: 6, E: 7, S: 6, W: 7 },
  N: { N: 9, E: 4, S: 6, W: 4 },
};

function renderDiagram(deal: Deal, width = NARROW) {
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
  });

  it("holds no holding outside its column", () => {
    // Thirteen ranks have to fit a third of a phone's width. The void deal
    // has the longest suits of the mocks, six cards with two tens.
    for (const deal of [MOCK_DEAL, MOCK_VOID_DEAL]) {
      renderDiagram(deal);
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
    // with each side's points, fits and makeable contracts underneath, the
    // whole deal takes little more than half of that.
    renderDiagram(MOCK_DEAL);
    const height = container!
      .querySelector('[data-testid="hand-diagram"]')!
      .getBoundingClientRect().height;
    expect(height).toBeGreaterThan(0);
    expect(height).toBeLessThan(400);
  });
});
