import { describe, expect, it, afterEach } from "vitest";
import { createElement as h } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { PracticeReview } from "../PracticeReview";
import { CallTable } from "../CallTable";
import { MOCK_DEAL, MOCK_CALL_HISTORY } from "../../bridge/mock";
import type { DoubleDummyTable } from "../../dds/dds-core";
import type { CallVerdict } from "../../practice/verdicts";
import type { Summary } from "../../practice/stats";
import "../../index.css";

/**
 * Safari's visible viewport on a modern iPhone: 393 CSS px wide, and about
 * 665 tall once its own bars are out of the way. The narrower iPhone SE is
 * shorter still, so the height is the one to design against.
 */
const PHONE = { width: 393, height: 665 };

const TABLE = Object.fromEntries(
  ["C", "D", "H", "S", "N"].map((strain) => [
    strain,
    { N: 9, E: 4, S: 9, W: 4 },
  ]),
) as DoubleDummyTable;

// South bids at indices 2 and 6 of the mock auction, one of them off system.
const VERDICTS: CallVerdict[] = [
  {
    index: 2,
    call: { type: "bid", level: 2, strain: "C" },
    sayc: { call: { type: "bid", level: 2, strain: "C" } },
    matched: true,
    assisted: false,
  },
  {
    index: 6,
    call: { type: "bid", level: 3, strain: "N" },
    sayc: {
      call: { type: "bid", level: 4, strain: "S" },
      ruleName: "Major Suit Game",
      description: "Enough for game opposite a limit raise",
      constraints: "15-17 hcp, 5+S",
    },
    matched: false,
    assisted: false,
  },
];

const SUMMARY: Summary = {
  hands: 7,
  calls: 20,
  matched: 17,
  handsOnSystem: 4,
  streak: 2,
  bestStreak: 3,
  bySource: {},
};

let root: Root | undefined;
let viewport: HTMLElement | undefined;

afterEach(() => {
  root?.unmount();
  viewport?.remove();
  root = undefined;
  viewport = undefined;
});

/** The review as the page lays it out, inside a phone-sized scrolling box. */
function renderReview() {
  viewport = document.createElement("div");
  viewport.style.width = `${PHONE.width}px`;
  viewport.style.height = `${PHONE.height}px`;
  viewport.style.overflowY = "auto";
  document.body.style.margin = "0";
  document.body.append(viewport);
  root = createRoot(viewport);
  flushSync(() =>
    root!.render(
      h(
        MemoryRouter,
        null,
        h(
          "div",
          { className: "bg-gray-50 flex flex-col" },
          h(
            "div",
            {
              className:
                "flex-1 flex flex-col max-w-md mx-auto w-full p-4 gap-4",
            },
            h(CallTable, {
              callHistory: MOCK_CALL_HISTORY,
              vulnerability: "NS",
              userPosition: "S",
              verdicts: { 2: true, 6: false },
            }),
            h(PracticeReview, {
              deal: MOCK_DEAL,
              boardNumber: 3,
              dealer: "N",
              history: MOCK_CALL_HISTORY,
              verdicts: VERDICTS,
              userPosition: "S",
              saycAuction: MOCK_CALL_HISTORY,
              vulnerability: "NS",
              doubleDummy: {
                analysis: {
                  table: TABLE,
                  lead: {
                    leader: "E",
                    card: { suit: "S", rank: "4" },
                    reason: "fourth best",
                    partnerSuits: [],
                    theirSuits: [],
                  },
                  tricksAfterLead: 9,
                },
                error: null,
              },
              summary: SUMMARY,
              feedbackTiming: "end",
              thinking: false,
              shareUrl: "https://saycbridge.com/bid/board",
              onShowOptions: () => {},
              onError: () => {},
              onShowFeedbackEachCall: () => {},
              onNextHand: () => {},
              onRestart: () => {},
            }),
          ),
        ),
      ),
    ),
  );
}

/** Whether an element lies entirely within the phone-sized box. */
function isOnScreen(element: Element): boolean {
  const box = element.getBoundingClientRect();
  const screen = viewport!.getBoundingClientRect();
  return box.top >= screen.top - 1 && box.bottom <= screen.bottom + 1;
}

function nextHand(): HTMLElement {
  return [...viewport!.querySelectorAll("button")].find(
    (button) => button.textContent === "Next hand",
  )!;
}

describe("PracticeReview layout", () => {
  it("keeps Next hand on the screen, wherever the review is scrolled", () => {
    renderReview();
    // A zero height here would mean Tailwind never loaded.
    expect(nextHand().getBoundingClientRect().height).toBeGreaterThan(0);

    viewport!.scrollTop = 0;
    expect(isOnScreen(nextHand())).toBe(true);

    viewport!.scrollTop = viewport!.scrollHeight;
    expect(isOnScreen(nextHand())).toBe(true);

    viewport!.scrollTop = Math.round(viewport!.scrollHeight / 2);
    expect(isOnScreen(nextHand())).toBe(true);
  });

  it("leaves the whole review readable under the pinned actions", () => {
    renderReview();
    viewport!.scrollTop = viewport!.scrollHeight;
    // The actions are the last thing in the column, so at the foot of the
    // page they come to rest below the footer rather than covering it.
    const actions = viewport!.querySelector('[data-testid="review-actions"]')!;
    const footer = viewport!.querySelector("footer")!;
    expect(footer.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      actions.getBoundingClientRect().top + 1,
    );
  });

  it("shows the result and the hands within a screen and a half", () => {
    renderReview();
    const diagram = viewport!.querySelector('[data-testid="hand-diagram"]')!;
    const top = viewport!
      .querySelector('[data-testid="result-card"]')!
      .getBoundingClientRect().top;
    const read = diagram.getBoundingClientRect().bottom - top;
    expect(read).toBeGreaterThan(0);
    expect(read).toBeLessThan(PHONE.height * 1.5);
  });
});
