import { describe, expect, it } from "vitest";
import { isEngineRequest, isEngineResponse } from "../engine-protocol";

describe("isEngineRequest", () => {
  it("accepts complete requests for every supported operation", () => {
    expect(
      isEngineRequest({
        id: 1,
        method: "get_next_call",
        arguments: { identifier: "board" },
      }),
    ).toBe(true);
    expect(
      isEngineRequest({
        id: 2,
        method: "get_suggested_call",
        arguments: { identifier: "board" },
      }),
    ).toBe(true);
    expect(
      isEngineRequest({
        id: 3,
        method: "get_call_interpretations",
        arguments: { calls: "", dealer: "N", vulnerability: "None" },
      }),
    ).toBe(true);
    expect(
      isEngineRequest({
        id: 4,
        method: "generate_filtered_board",
        arguments: { focus: "Random" },
      }),
    ).toBe(true);
  });

  it("rejects malformed and unsupported requests", () => {
    expect(isEngineRequest(null)).toBe(false);
    expect(
      isEngineRequest({ id: "1", method: "get_next_call", arguments: {} }),
    ).toBe(false);
    expect(isEngineRequest({ id: 1, method: "unknown", arguments: {} })).toBe(
      false,
    );
    expect(
      isEngineRequest({ id: 1, method: "get_next_call", arguments: null }),
    ).toBe(false);
  });
});

describe("isEngineResponse", () => {
  it("accepts successful and failed responses", () => {
    expect(isEngineResponse({ id: 1, ok: true, result: null })).toBe(true);
    expect(
      isEngineResponse({
        id: 1,
        ok: false,
        error: { message: "Invalid board" },
      }),
    ).toBe(true);
  });

  it("rejects malformed responses", () => {
    expect(isEngineResponse({ id: "1", ok: true, result: "P" })).toBe(false);
    expect(isEngineResponse({ id: 1, ok: true })).toBe(false);
    expect(isEngineResponse({ id: 1, ok: false, error: "failed" })).toBe(false);
  });
});
