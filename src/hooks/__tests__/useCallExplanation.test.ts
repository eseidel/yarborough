import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useCallExplanation } from "../useCallExplanation";
import type { CallHistory } from "../../bridge/types";
import * as engine from "../../bridge/engine";

vi.mock("../../bridge/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../bridge/engine")>();
  return {
    ...actual,
    getCallInterpretations: vi.fn(),
  };
});

const mockGetCallInterpretations = vi.mocked(engine.getCallInterpretations);

const history: CallHistory = {
  dealer: "N",
  calls: [{ type: "bid", level: 1, strain: "H" }, { type: "pass" }],
};

describe("useCallExplanation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and exposes the interpretation for the clicked call", async () => {
    mockGetCallInterpretations.mockResolvedValue([
      {
        call: { type: "bid", level: 1, strain: "H" },
        ruleName: "OneLevelSuitOpening",
        description: "12-21 HCP, 5+ hearts",
      },
    ]);

    const { result } = renderHook(() => useCallExplanation(history, "NS"));

    act(() => result.current.handleCallClick(0));

    expect(result.current.selectedCallIndex).toBe(0);
    expect(result.current.explanationLoading).toBe(true);

    await waitFor(() => expect(result.current.explanationLoading).toBe(false));

    expect(result.current.callExplanation).toEqual({
      call: { type: "bid", level: 1, strain: "H" },
      ruleName: "OneLevelSuitOpening",
      description: "12-21 HCP, 5+ hearts",
    });
    expect(mockGetCallInterpretations).toHaveBeenCalledWith("", "N", "NS");
  });

  it("toggles the selection off when the same call is clicked again", async () => {
    mockGetCallInterpretations.mockResolvedValue([]);
    const { result } = renderHook(() => useCallExplanation(history));

    act(() => result.current.handleCallClick(1));
    await waitFor(() => expect(result.current.explanationLoading).toBe(false));

    act(() => result.current.handleCallClick(1));

    expect(result.current.selectedCallIndex).toBeNull();
    expect(result.current.callExplanation).toBeNull();
  });

  it("reports a failed lookup through onError and stops loading", async () => {
    const onError = vi.fn();
    mockGetCallInterpretations.mockRejectedValue(new Error("engine down"));
    const { result } = renderHook(() =>
      useCallExplanation(history, "None", onError),
    );

    act(() => result.current.handleCallClick(0));

    await waitFor(() => expect(result.current.explanationLoading).toBe(false));
    expect(onError).toHaveBeenCalledWith(new Error("engine down"));
  });

  it("does nothing when there is no history to explain", () => {
    const { result } = renderHook(() => useCallExplanation(null));

    act(() => result.current.handleCallClick(0));

    expect(result.current.selectedCallIndex).toBeNull();
    expect(mockGetCallInterpretations).not.toHaveBeenCalled();
  });

  it("resets the selection and explanation", async () => {
    mockGetCallInterpretations.mockResolvedValue([]);
    const { result } = renderHook(() => useCallExplanation(history));

    act(() => result.current.handleCallClick(0));
    await waitFor(() => expect(result.current.explanationLoading).toBe(false));

    act(() => result.current.reset());

    expect(result.current.selectedCallIndex).toBeNull();
    expect(result.current.callExplanation).toBeNull();
  });
});
