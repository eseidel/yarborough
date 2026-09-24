import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CallMenu } from "../CallMenu";
import {
  type HandAnalysis,
  type CallInterpretation,
  handFromCdhsString,
} from "../../bridge";

const PASS = { type: "pass" } as const;
const ONE_DIAMOND = { type: "bid", level: 1, strain: "D" } as const;
const ONE_HEART = { type: "bid", level: 1, strain: "H" } as const;
const ONE_SPADE = { type: "bid", level: 1, strain: "S" } as const;
const ONE_NOTRUMP = { type: "bid", level: 1, strain: "N" } as const;
const FOUR_NOTRUMP = { type: "bid", level: 4, strain: "N" } as const;
const SEVEN_CLUBS = { type: "bid", level: 7, strain: "C" } as const;

/** ♠AQ982 ♥K5 ♦A973 ♣42: 13 hcp, opens 1♠. */
const HAND = handFromCdhsString("42.A973.K5.AQ982")!;

const INTERPRETATIONS: CallInterpretation[] = [
  { call: PASS, ruleName: "Pass" },
  { call: ONE_DIAMOND, ruleName: "One Level Opening", constraints: "12+ hcp" },
  { call: ONE_HEART, ruleName: "One Level Opening", constraints: "5+ ♥" },
  { call: ONE_SPADE, ruleName: "One Level Opening", constraints: "5+ ♠" },
  { call: ONE_NOTRUMP, ruleName: "NoTrump Opening", constraints: "15-17" },
  { call: FOUR_NOTRUMP, ruleName: "Blackwood" },
  { call: SEVEN_CLUBS },
];

const ANALYSIS: HandAnalysis = {
  call: ONE_SPADE,
  calls: [
    {
      ...INTERPRETATIONS[0],
      fit: "possible",
      misses: [],
      preference: {
        kind: "purpose",
        over: ONE_SPADE,
        purpose: "Forced",
        overPurpose: "MajorDiscovery",
      },
    },
    {
      ...INTERPRETATIONS[1],
      fit: "possible",
      misses: [],
      preference: {
        kind: "rule",
        over: ONE_SPADE,
        purpose: "MinorDiscovery",
        overPurpose: "MajorDiscovery",
        entry: { kind: "longest", calls: [ONE_HEART, ONE_SPADE] },
      },
    },
    {
      ...INTERPRETATIONS[2],
      fit: "unfit",
      misses: [{ kind: "length", suit: "H", min: 5, max: 13, actual: 2 }],
    },
    { ...INTERPRETATIONS[3], fit: "chosen", misses: [] },
    {
      ...INTERPRETATIONS[4],
      fit: "unfit",
      misses: [
        { kind: "points", min: 15, max: 17, actual: 13, withShape: false },
        { kind: "balanced" },
      ],
    },
    { ...INTERPRETATIONS[5], fit: "planned", misses: [] },
    { ...INTERPRETATIONS[6], fit: "no_rule", misses: [] },
  ],
};

function row(name: string) {
  return screen.getByTestId(`call-row-${name}`);
}

describe("CallMenu", () => {
  it("lists every call with its meaning, in bidding order, without a hand", () => {
    render(<CallMenu interpretations={INTERPRETATIONS} />);
    const rows = screen.getAllByTestId(/^call-row-/);
    expect(rows.map((r) => r.dataset.testid)).toEqual([
      "call-row-P",
      "call-row-1D",
      "call-row-1H",
      "call-row-1S",
      "call-row-1N",
      "call-row-4N",
      "call-row-7C",
    ]);
    expect(within(row("7C")).getByText("No SAYC meaning")).toBeTruthy();
    expect(row("1S").dataset.fit).toBeUndefined();
  });

  it("ignores an analysis when there is no hand to show", () => {
    render(<CallMenu interpretations={INTERPRETATIONS} analysis={ANALYSIS} />);
    expect(screen.queryByText("SAYC")).toBeNull();
  });

  describe("weighed against a hand", () => {
    function renderWeighed(onSelect = vi.fn()) {
      render(
        <CallMenu
          interpretations={INTERPRETATIONS}
          analysis={ANALYSIS}
          hand={HAND}
          onSelect={onSelect}
        />,
      );
      return onSelect;
    }

    it("marks SAYC's call in place, with the numbers that qualify it", () => {
      renderWeighed();
      const rows = screen.getAllByTestId(/^call-row-/);
      // The calls keep their bidding order: the choice is read in context.
      expect(rows.map((r) => r.dataset.testid)).toEqual([
        "call-row-P",
        "call-row-1D",
        "call-row-1H",
        "call-row-1S",
        "call-row-1N",
        "call-row-4N",
        "call-row-7C",
      ]);
      expect(row("1S").dataset.fit).toBe("chosen");
      expect(row("1S").textContent).toContain("SAYC");
      expect(row("1S").textContent).toContain("You have 13 hcp and 5 ♠.");
    });

    it("says why SAYC preferred its call to one the hand could also make", () => {
      renderWeighed();
      expect(row("P").textContent).toContain(
        "SAYC prefers 1♠. Pass is for a hand with nothing better to say.",
      );
      expect(row("1D").textContent).toContain(
        "SAYC prefers 1♠: the longest of 1♥ and 1♠ comes first.",
      );
      expect(row("1D").textContent).toContain("Fits");
    });

    it("says what a call the hand doesn't fit needs, without its meaning", () => {
      renderWeighed();
      expect(row("1H").textContent).toContain("Needs 5+ ♥, you have 2.");
      expect(row("1H").textContent).not.toContain("5+ ♥One");
      expect(row("1N").textContent).toContain(
        "Needs 15–17 hcp, you have 13. Needs a balanced hand.",
      );
      expect(row("1N").textContent).not.toContain("15-17");
    });

    it("marks a call made only by plan and one no rule makes", () => {
      renderWeighed();
      expect(row("4N").textContent).toContain("Only bid as part of a plan");
      expect(row("7C").textContent).toContain("No SAYC meaning");
    });

    it("still makes any call, fitting or not", () => {
      const onSelect = renderWeighed();
      fireEvent.click(row("1H"));
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ call: ONE_HEART }),
      );
    });
  });
});
