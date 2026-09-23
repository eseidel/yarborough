import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type HandAnalysisRequest,
  clearHandAnalysisCache,
  useHandAnalysis,
} from "../useHandAnalysis";
import type { HandAnalysis } from "../../bridge/types";
import { handFromCdhsString } from "../../bridge/types";
import * as engine from "../../bridge/engine";

vi.mock("../../bridge/engine", () => ({ getHandAnalysis: vi.fn() }));
const mockGetHandAnalysis = vi.mocked(engine.getHandAnalysis);

const HAND = handFromCdhsString("K6.A52.Q853.KJ74")!;
const ANALYSIS: HandAnalysis = {
  call: { type: "bid", level: 3, strain: "H" },
  calls: [],
};
const request = (index: number): HandAnalysisRequest => ({
  hand: HAND,
  history: {
    dealer: "N",
    calls: [
      { type: "bid", level: 1, strain: "H" },
      { type: "pass" },
      { type: "bid", level: 3, strain: "H" },
    ],
  },
  index,
  vulnerability: "NS",
});

describe("useHandAnalysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearHandAnalysisCache();
  });

  it("weighs the hand at the calls before the point", async () => {
    mockGetHandAnalysis.mockResolvedValue(ANALYSIS);
    const { result } = renderHook(() => useHandAnalysis(request(2)));
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toEqual(ANALYSIS));
    expect(mockGetHandAnalysis).toHaveBeenCalledWith(HAND, "1H,P", "N", "NS");
  });

  it("asks the engine once for the same point", async () => {
    mockGetHandAnalysis.mockResolvedValue(ANALYSIS);
    const first = renderHook(() => useHandAnalysis(request(2)));
    await waitFor(() => expect(first.result.current).toEqual(ANALYSIS));
    const second = renderHook(() => useHandAnalysis(request(2)));
    await waitFor(() => expect(second.result.current).toEqual(ANALYSIS));
    expect(mockGetHandAnalysis).toHaveBeenCalledTimes(1);
  });

  it("is null with nothing to weigh, and when the engine fails", async () => {
    const idle = renderHook(() => useHandAnalysis(null));
    expect(idle.result.current).toBeNull();
    expect(mockGetHandAnalysis).not.toHaveBeenCalled();

    mockGetHandAnalysis.mockRejectedValue(new Error("worker gone"));
    const failed = renderHook(() => useHandAnalysis(request(0)));
    await waitFor(() => expect(failed.result.current).toBeNull());
  });
});
