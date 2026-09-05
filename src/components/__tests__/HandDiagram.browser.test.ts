import { describe, expect, it, afterEach } from "vitest";
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { HandDiagram } from "../HandDiagram";
import { MOCK_DEAL, MOCK_VOID_DEAL } from "../../bridge/mock";
import type { Deal, Position } from "../../bridge/types";
import "../../index.css";

let root: Root | undefined;
let container: HTMLElement | undefined;

afterEach(() => {
  root?.unmount();
  container?.remove();
  root = undefined;
  container = undefined;
});

function renderDiagram(deal: Deal) {
  container = document.createElement("div");
  // A phone-width column, the narrowest the diagram is laid out in.
  container.style.width = "390px";
  document.body.append(container);
  root = createRoot(container);
  flushSync(() => root!.render(createElement(HandDiagram, { deal })));
}

/** The top of each of a hand's suit rows, relative to the hand's own box. */
function rowTops(position: Position): number[] {
  const box = container!.querySelector(`[data-testid="hand-${position}"]`)!;
  const rows = box.querySelector('[data-testid="suit-rows"]')!;
  const origin = box.getBoundingClientRect().top;
  return [...rows.children].map(
    (row) => row.getBoundingClientRect().top - origin,
  );
}

describe("HandDiagram layout", () => {
  it("keeps West's and East's suits on the same lines when one hand is void", () => {
    renderDiagram(MOCK_VOID_DEAL);

    // The blank line is exactly a card tall, so the suits below it do not
    // move up. A zero height here would also mean Tailwind never loaded and
    // the measurements below say nothing.
    const cardHeight = container!
      .querySelector('[data-testid="mini-card"]')!
      .getBoundingClientRect().height;
    expect(cardHeight).toBeGreaterThan(0);
    expect(
      container!
        .querySelector('[data-testid="void-row-H"]')!
        .getBoundingClientRect().height,
    ).toBe(cardHeight);

    const west = rowTops("W");
    const east = rowTops("E");
    expect(west).toHaveLength(4);
    expect(east).toHaveLength(4);
    // Row 1 is West's void: blank, but still where East shows its hearts.
    expect(west).toEqual(east);
    expect(new Set(west).size).toBe(4);
  });

  it("lines the hands up when neither is void", () => {
    renderDiagram(MOCK_DEAL);
    expect(rowTops("W")).toEqual(rowTops("E"));
  });
});
