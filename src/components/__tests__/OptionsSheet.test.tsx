import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OptionsSheet } from "../OptionsSheet";
import type { CallHistory } from "../../bridge/types";
import * as engine from "../../bridge/engine";

vi.mock("../../bridge/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../bridge/engine")>();
  return { ...actual, getCallInterpretations: vi.fn() };
});
const mockGetCallInterpretations = vi.mocked(engine.getCallInterpretations);

const HISTORY: CallHistory = {
  dealer: "N",
  calls: [{ type: "bid", level: 1, strain: "N" }, { type: "pass" }],
};

describe("OptionsSheet", () => {
  beforeEach(() => {
    mockGetCallInterpretations.mockReset();
    mockGetCallInterpretations.mockResolvedValue([
      {
        call: { type: "bid", level: 2, strain: "C" },
        ruleName: "Stayman",
        constraints: "8+ hcp",
      },
      { call: { type: "pass" } },
    ]);
  });

  it("lists every legal call at the pending point and bids the tapped one", async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <OptionsSheet
        point={{ history: HISTORY, index: 2 }}
        vulnerability="NS"
        onSelect={onSelect}
        onClose={onClose}
      />,
    );
    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      "Options after 1NT · Pass",
    );
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText("Stayman")).toBeInTheDocument(),
    );
    expect(mockGetCallInterpretations).toHaveBeenCalledWith("1N,P", "N", "NS");
    expect(screen.getByText("Not a SAYC call here")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Stayman"));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ ruleName: "Stayman" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("is read-only for an earlier point and closes on the backdrop or Escape", async () => {
    const onClose = vi.fn();
    render(
      <OptionsSheet
        point={{ history: HISTORY, index: 0 }}
        vulnerability="None"
        onClose={onClose}
      />,
    );
    expect(screen.getByRole("dialog")).toHaveAccessibleName(
      "Options as opener",
    );
    await waitFor(() =>
      expect(screen.getByText("Stayman")).toBeInTheDocument(),
    );
    expect(mockGetCallInterpretations).toHaveBeenCalledWith("", "N", "None");
    expect(
      screen.queryByRole("button", { name: /stayman/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("options-sheet"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("reports a failure to load", async () => {
    mockGetCallInterpretations.mockRejectedValue(new Error("engine down"));
    render(
      <OptionsSheet
        point={{ history: HISTORY, index: 2 }}
        vulnerability="None"
        onClose={() => {}}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText(/engine down/)).toBeInTheDocument(),
    );
  });
});
