import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initAnalytics, trackPageView, trackEvent } from "../analytics";

describe("analytics", () => {
  beforeEach(() => {
    delete window._gaq;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not crash or queue when disabled in development/test environment", () => {
    initAnalytics();
    trackPageView("/bid/1");
    trackEvent("Bidding", "Result", "matched autobidder");

    // In Vitest environment, import.meta.env.DEV is true, so analytics is disabled
    expect(window._gaq).toBeUndefined();
  });
});
