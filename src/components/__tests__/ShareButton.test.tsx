import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ShareButton } from "../ShareButton";
import * as analytics from "../../analytics";

describe("ShareButton", () => {
  const props = {
    url: "https://saycbridge.com/bid/1-abc",
    title: "SAYC Bridge Practice Hand",
    text: "Board 1 — try this bridge bidding hand",
  };

  beforeEach(() => {
    vi.spyOn(analytics, "trackEvent").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error -- test-only cleanup of a per-test stub.
    delete navigator.share;
  });

  it("invokes the platform share sheet when available", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      value: share,
      configurable: true,
    });

    render(<ShareButton {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /share hand/i }));

    await waitFor(() => expect(share).toHaveBeenCalledWith(props));
    expect(analytics.trackEvent).toHaveBeenCalledWith("Sharing", "Share Hand");
    expect(screen.getByRole("button", { name: /share hand/i })).toBeVisible();
  });

  it("does not throw when the user dismisses the share sheet", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("AbortError"));
    Object.defineProperty(navigator, "share", {
      value: share,
      configurable: true,
    });

    render(<ShareButton {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /share hand/i }));

    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /share hand/i })).toBeVisible();
  });

  it("falls back to copying the link to the clipboard", async () => {
    Object.defineProperty(navigator, "share", {
      value: undefined,
      configurable: true,
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<ShareButton {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /share hand/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(props.url));
    expect(
      await screen.findByRole("button", { name: /link copied/i }),
    ).toBeInTheDocument();
  });
});
