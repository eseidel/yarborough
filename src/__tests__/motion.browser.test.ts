import { afterEach, describe, expect, it } from "vitest";
import { cdp } from "vitest/browser";
// Types the CDP session as Playwright's, which knows the calls it can send.
import type {} from "@vitest/browser-playwright";
import { createElement as h } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { CALL_STAGGER_MS, CallTable } from "../components/CallTable";
import type { Call, CallHistory } from "../bridge";
import "../index.css";

/** The app's own arrivals, defined in index.css. */
const ARRIVALS = [
  "animate-deal",
  "animate-rise",
  "animate-fade",
  "animate-fade-late",
  "animate-pop",
  "animate-sheet",
];

/** Every style rule in the page, with the media queries it sits inside. */
function styleRules(): { selector: string; media: string[] }[] {
  const found: { selector: string; media: string[] }[] = [];
  const walk = (rules: CSSRuleList, media: string[]) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        found.push({ selector: rule.selectorText, media });
      }
      if (rule instanceof CSSMediaRule) {
        walk(rule.cssRules, [...media, rule.conditionText]);
      } else if ("cssRules" in rule) {
        walk((rule as CSSGroupingRule).cssRules, media);
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    walk(sheet.cssRules, []);
  }
  return found;
}

function seconds(time: string): number {
  return Math.max(
    ...time
      .split(",")
      .map((t) =>
        t.trim().endsWith("ms") ? parseFloat(t) / 1000 : parseFloat(t),
      ),
  );
}

/** An element wearing `className`, as the page would style it. */
function probe(className: string): HTMLElement {
  const el = document.createElement("div");
  el.className = className;
  document.body.appendChild(el);
  return el;
}

async function prefersReducedMotion(reduce: boolean) {
  await cdp().send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-reduced-motion", value: reduce ? "reduce" : "" },
    ],
  });
}

describe("motion", () => {
  let root: Root | null = null;

  afterEach(async () => {
    root?.unmount();
    root = null;
    document.body.innerHTML = "";
    await prefersReducedMotion(false);
  });

  it("defines every arrival only for a reader who has not asked for reduced motion", () => {
    const rules = styleRules();
    for (const name of ARRIVALS) {
      const own = rules.filter((rule) =>
        rule.selector.split(",").some((s) => s.trim() === `.${name}`),
      );
      expect(own.length, name).toBeGreaterThan(0);
      for (const rule of own) {
        expect(rule.media.join(" "), name).toContain(
          "prefers-reduced-motion: no-preference",
        );
      }
    }
  });

  it("keeps every arrival under a quarter of a second, and any wait short", () => {
    for (const name of ARRIVALS) {
      const style = getComputedStyle(probe(name));
      expect(style.animationName, name).not.toBe("none");
      expect(seconds(style.animationDuration), name).toBeLessThanOrEqual(0.26);
      expect(seconds(style.animationDelay), name).toBeLessThanOrEqual(0.3);
    }
  });

  it("runs none of them when the reader asks for reduced motion", async () => {
    await prefersReducedMotion(true);
    expect(matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
    for (const name of ARRIVALS) {
      expect(getComputedStyle(probe(name)).animationName, name).toBe("none");
    }
  });

  it("lands the calls just made in the auction one after another", () => {
    const history = (calls: Call[]): CallHistory => ({ dealer: "N", calls });
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const pass: Call = { type: "pass" };
    flushSync(() => root!.render(h(CallTable, { callHistory: history([]) })));
    flushSync(() =>
      root!.render(h(CallTable, { callHistory: history([pass, pass, pass]) })),
    );

    const landing = [0, 1, 2].map((i) =>
      getComputedStyle(container.querySelector(`[data-testid="call-${i}"]`)!),
    );
    expect(landing.map((style) => style.animationName)).toEqual([
      "pop",
      "pop",
      "pop",
    ]);
    expect(landing.map((style) => seconds(style.animationDelay))).toEqual([
      0,
      CALL_STAGGER_MS / 1000,
      (2 * CALL_STAGGER_MS) / 1000,
    ]);
  });
});
