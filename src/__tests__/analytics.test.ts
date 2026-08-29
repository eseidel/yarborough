import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The module keeps `initialized` state, so each test imports it fresh.
 * Production is simulated by clearing DEV and setting a production hostname —
 * without both, every entry point short-circuits and nothing is exercised.
 */
async function loadAnalytics(hostname: string, isDev = false) {
  vi.resetModules();
  vi.stubEnv("DEV", isDev);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      hostname,
      pathname: "/bid/1",
      href: `https://${hostname}/bid/1`,
    },
  });
  return import("../analytics");
}

function dataLayer(): unknown[][] {
  return (window.dataLayer ?? []) as unknown[][];
}

function callsNamed(name: string): unknown[][] {
  return dataLayer().filter(
    (entry) => entry[0] === "event" && entry[1] === name,
  );
}

describe("analytics", () => {
  // Captured rather than inserted: a real insertion makes happy-dom attempt to
  // fetch gtag.js. The element we construct is what matters here, not the
  // network, and intercepting keeps a failed request out of every run.
  let appended: HTMLScriptElement[];

  beforeEach(() => {
    delete window.dataLayer;
    document.title = "Bidding Practice - SAYC Bridge";
    appended = [];
    vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
      appended.push(node as HTMLScriptElement);
      return node;
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("when disabled", () => {
    it("stays inert in development", async () => {
      const a = await loadAnalytics("saycbridge.com", true);
      a.initAnalytics();
      a.trackPageView("/bid/1");
      a.trackEvent("Bidding", "Result", "matched autobidder");

      expect(window.dataLayer).toBeUndefined();
      expect(appended).toHaveLength(0);
    });

    // Preview shares its build artifact with production, so the hostname is
    // the only thing that can keep dev traffic out of the production property.
    it("stays inert on the preview hostname", async () => {
      const a = await loadAnalytics("dev.saycbridge.com");
      a.initAnalytics();
      a.trackPageView();

      expect(window.dataLayer).toBeUndefined();
      expect(appended).toHaveLength(0);
    });

    it("stays inert on workers.dev fallback hostnames", async () => {
      const a = await loadAnalytics("saycbridge.saycbridge-com.workers.dev");
      a.initAnalytics();
      expect(window.dataLayer).toBeUndefined();
    });
  });

  describe("on production", () => {
    it("loads gtag.js for the configured property", async () => {
      const a = await loadAnalytics("saycbridge.com");
      a.initAnalytics();

      expect(appended).toHaveLength(1);
      expect(appended[0].src).toBe(
        "https://www.googletagmanager.com/gtag/js?id=G-V8KS5372FL",
      );
      expect(appended[0].async).toBe(true);
    });

    // Automatic page views fire once per document. This app is client-routed,
    // so every route after the first would be lost, and the first would be
    // double counted against the explicit call.
    it("configures gtag without automatic page views", async () => {
      const a = await loadAnalytics("saycbridge.com");
      a.initAnalytics();

      const config = dataLayer().find((entry) => entry[0] === "config");
      expect(config?.[1]).toBe("G-V8KS5372FL");
      expect(config?.[2]).toEqual({ send_page_view: false });
    });

    it("only initializes once across pages", async () => {
      const a = await loadAnalytics("saycbridge.com");
      a.initAnalytics();
      a.initAnalytics();

      expect(appended).toHaveLength(1);
    });

    it("sends an explicit page view for the current route", async () => {
      const a = await loadAnalytics("saycbridge.com");
      a.initAnalytics();
      a.trackPageView("/explore");

      expect(callsNamed("page_view")).toHaveLength(1);
      expect(callsNamed("page_view")[0][2]).toMatchObject({
        page_path: "/explore",
        page_location: "https://saycbridge.com/bid/1",
        page_title: "Bidding Practice - SAYC Bridge",
      });
    });

    it("falls back to the current path when none is given", async () => {
      const a = await loadAnalytics("saycbridge.com");
      a.initAnalytics();
      a.trackPageView();

      expect(callsNamed("page_view")[0][2]).toMatchObject({
        page_path: "/bid/1",
      });
    });

    // GA4 has no category or label of its own; these become event parameters.
    it("maps category and label onto the event", async () => {
      const a = await loadAnalytics("saycbridge.com");
      a.initAnalytics();
      a.trackEvent("Bidding", "Result", "matched autobidder");

      expect(callsNamed("Result")[0][2]).toEqual({
        event_category: "Bidding",
        event_label: "matched autobidder",
      });
    });

    it("omits the label when there is none", async () => {
      const a = await loadAnalytics("saycbridge.com");
      a.initAnalytics();
      a.trackEvent("Bidding", "Help");

      expect(callsNamed("Help")[0][2]).toEqual({ event_category: "Bidding" });
    });
  });
});
