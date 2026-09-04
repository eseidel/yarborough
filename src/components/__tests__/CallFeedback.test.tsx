import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CallFeedback } from "../CallFeedback";
import type { CallVerdict } from "../../practice/verdicts";

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

  it("explains a miss on request and opens the options", () => {
    const onShowOptions = vi.fn();
    render(<CallFeedback verdict={MISS} onShowOptions={onShowOptions} />);
    const feedback = screen.getByTestId("call-feedback-miss");
    expect(feedback.textContent).toContain(
      "✗ You bid 2♥; SAYC bids 4♥: Jump Raise.",
    );
    expect(screen.queryByText("Game raise")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Why?" }));
    expect(screen.getByText("Game raise")).toBeInTheDocument();
    expect(feedback.textContent).toContain("13-16 hcp, 4+");

    fireEvent.click(screen.getByRole("button", { name: "All options here" }));
    expect(onShowOptions).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /hide until/i })).toBeNull();
  });
});
