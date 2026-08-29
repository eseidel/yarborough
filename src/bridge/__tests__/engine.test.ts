import { describe, expect, it, vi } from "vitest";
import { createBiddingEngine, type EngineRequester } from "../engine";

function requester(result: unknown): EngineRequester {
  return { request: vi.fn().mockResolvedValue(result) };
}

describe("createBiddingEngine", () => {
  it("sends each public operation through the typed RPC contract", async () => {
    const rpc = requester([
      {
        call_name: "P",
        rule_name: "DefaultPass",
        description: null,
      },
    ]);
    const engine = createBiddingEngine(rpc);

    await expect(
      engine.getCallInterpretations("1C,P", "S", "NS"),
    ).resolves.toEqual([
      {
        call: { type: "pass" },
        ruleName: "DefaultPass",
        description: undefined,
      },
    ]);
    expect(rpc.request).toHaveBeenLastCalledWith("get_call_interpretations", {
      calls: "1C,P",
      dealer: "S",
      vulnerability: "NS",
    });
  });

  it("uses None as the default interpretation vulnerability", async () => {
    const rpc = requester([]);
    const engine = createBiddingEngine(rpc);

    await engine.getCallInterpretations("", "N");

    expect(rpc.request).toHaveBeenCalledWith("get_call_interpretations", {
      calls: "",
      dealer: "N",
      vulnerability: "None",
    });
  });

  it("parses next calls, suggestions, and generated board identifiers", async () => {
    const rpc: EngineRequester = {
      request: vi
        .fn()
        .mockResolvedValueOnce("2H")
        .mockResolvedValueOnce({
          call_name: "2H",
          rule_name: "PreemptiveOpen",
          description: null,
        })
        .mockResolvedValueOnce("8-0622931ecfe9993de30355dae4"),
    };
    const engine = createBiddingEngine(rpc);

    await expect(engine.getNextCall("board")).resolves.toEqual({
      type: "bid",
      level: 2,
      strain: "H",
    });
    await expect(engine.getSuggestedCall("board")).resolves.toEqual({
      call: { type: "bid", level: 2, strain: "H" },
      ruleName: "PreemptiveOpen",
      description: undefined,
    });
    await expect(engine.generateFilteredBoard("Preempt")).resolves.toBe(
      "8-0622931ecfe9993de30355dae4",
    );
    expect(rpc.request).toHaveBeenNthCalledWith(1, "get_next_call", {
      identifier: "board",
    });
    expect(rpc.request).toHaveBeenNthCalledWith(2, "get_suggested_call", {
      identifier: "board",
    });
    expect(rpc.request).toHaveBeenNthCalledWith(3, "generate_filtered_board", {
      focus: "Preempt",
    });
  });

  it("propagates RPC failures", async () => {
    const rpc: EngineRequester = {
      request: vi
        .fn()
        .mockRejectedValue(new Error("Pyodide initialization failed")),
    };
    const engine = createBiddingEngine(rpc);

    await expect(engine.getNextCall("board")).rejects.toThrow(
      "Pyodide initialization failed",
    );
  });
});
