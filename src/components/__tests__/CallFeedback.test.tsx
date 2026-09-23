import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CallFeedback } from "../CallFeedback";
import type { CallVerdict } from "../../practice/verdicts";
import { handFromCdhsString } from "../../bridge/types";

const MISS: CallVerdict = {
  index: 2,
  call: { type: "bid", level: 2, strain: "H" },
  sayc: {
    call: { type: "bid", level: 4, strain: "H" },
    ruleName: "Jump Raise",
    constraints: "13-16 hcp, 4+H",
    description: "Game raise",
  },
  matched: false,
  assisted: false,
};

describe("CallFeedback", () => {
  it("shows nothing for a matching call", () => {
    const { container } = render(
      <CallFeedback
        verdict={{
          ...MISS,
          call: MISS.sayc.call,
          matched: true,
          assisted: true,
        }}
        onDefer={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("call-feedback-match")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("says what SAYC bids instead and opens the options", () => {
    const onShowOptions = vi.fn();
    render(<CallFeedback verdict={MISS} onShowOptions={onShowOptions} />);
    const feedback = screen.getByTestId("call-feedback-miss");
    expect(feedback.textContent).toContain(
      "✗ You bid 2♥; SAYC bids 4♥: Jump Raise.",
    );
    // The hand's own numbers say why; the rule's ranges add nothing.
    expect(screen.queryByRole("button", { name: "Why?" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "All options here" }));
    expect(onShowOptions).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /hide until/i })).toBeNull();
    // Only a held call asks what next.
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("asks what next while the call is held", () => {
    const onTryAgain = vi.fn();
    const onKeep = vi.fn();
    render(
      <CallFeedback verdict={MISS} onTryAgain={onTryAgain} onKeep={onKeep} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onTryAgain).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Keep 2/ }));
    expect(onKeep).toHaveBeenCalled();
  });

  it("shows nothing for SAYC's call found on a retry", () => {
    const { container } = render(
      <CallFeedback
        verdict={{ ...MISS, call: MISS.sayc.call, firstCall: MISS.call }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("explains a miss in the numbers of the user's hand", () => {
    // ♠963 ♥KQ74 ♦A52 ♣KJ3: thirteen points and four hearts.
    const hand = handFromCdhsString("KJ3.A52.KQ74.963")!;
    const { rerender } = render(
      <CallFeedback verdict={MISS} hand={hand} analysis={undefined} />,
    );
    // Nothing while the engine weighs the hand.
    expect(screen.queryByTestId("hand-reasons")).toBeNull();

    rerender(
      <CallFeedback
        verdict={MISS}
        hand={hand}
        analysis={{
          calls: [
            {
              call: MISS.call,
              fit: "unfit",
              misses: [
                {
                  kind: "points",
                  min: 6,
                  max: 10,
                  actual: 13,
                  withShape: false,
                },
              ],
            },
          ],
        }}
      />,
    );
    expect(screen.getByTestId("hand-reasons")).toHaveTextContent(
      "You have 13 hcp and 4 ♥.2♥ doesn't fit your hand. Needs 6–10 hcp, you have 13.",
    );
  });
});
