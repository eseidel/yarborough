import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import App from "../App";

// The root route renders a board; nothing else in this test interacts with
// the engine, so the auction just never resolves.
vi.mock("../bridge/auction", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../bridge/auction")>();
  return {
    ...actual,
    addRobotBids: vi.fn(() => new Promise(() => {})),
    getFullAutobidAuction: vi.fn(() => new Promise(() => {})),
  };
});

describe("routing", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("renders the practice page at / without redirecting to a permalink", () => {
    render(<App />);
    // A redirect to /bid/<board> would leave the site's most-linked URL with
    // nothing on it for a crawler that does not follow the redirect.
    expect(window.location.pathname).toBe("/");
    expect(screen.getByRole("link", { name: "Practice" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explore" })).toBeInTheDocument();
  });

  it("canonicalizes the root route to the apex", () => {
    render(<App />);
    expect(
      document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href,
    ).toBe("https://saycbridge.com/");
    expect(document.title).toBe("Bidding Practice - SAYC Bridge");
  });

  it("canonicalizes a board permalink to itself, not to the root", () => {
    window.history.replaceState({}, "", "/bid/1-00000000000000000000000000");
    render(<App />);
    expect(
      document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href,
    ).toBe("https://saycbridge.com/bid/1-00000000000000000000000000");
  });
});
