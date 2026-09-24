import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import App from "../App";
import { addRobotBids } from "../bridge/auction";
import type { CallHistory } from "../bridge";

/** The boards the root route deals next, in order, before random ones. */
const boards = vi.hoisted(() => ({ next: [] as string[] }));

vi.mock("../bridge/identifier", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../bridge/identifier")>();
  return {
    ...actual,
    generateBoardId: vi.fn(() => {
      const board = actual.generateBoardId();
      const id = boards.next.shift();
      return id ? { ...board, id } : board;
    }),
  };
});

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
    boards.next = [];
  });

  it("renders the practice page at / without redirecting to a permalink", () => {
    render(<App />);
    // A redirect to /bid/<board> would leave the site's most-linked URL with
    // nothing on it for a crawler that does not follow the redirect.
    expect(window.location.pathname).toBe("/");
    expect(screen.getByRole("link", { name: "Practice" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explore" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Progress" })).toBeInTheDocument();
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

  it("keeps the page as it is when the root's board moves to its permalink", async () => {
    // Board 4: West deals, so the table bids before South and the address
    // bar takes the board's permalink once it has.
    const board = "4-00000000000000000000000000";
    boards.next = [board];
    vi.mocked(addRobotBids).mockImplementationOnce(
      async (from: CallHistory) => ({
        ...from,
        calls: [
          ...from.calls,
          { type: "pass" },
          { type: "pass" },
          { type: "pass" },
        ],
      }),
    );
    render(<App />);
    const table = screen.getByTestId("call-table");

    await waitFor(() =>
      expect(window.location.pathname).toBe(`/bid/${board}:P,P,P`),
    );
    await waitFor(() =>
      expect(
        document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href,
      ).toBe(`https://saycbridge.com/bid/${board}:P,P,P`),
    );
    // Not built again: the calls that just arrived land on the same table.
    expect(screen.getByTestId("call-table")).toBe(table);
    expect(screen.getByTestId("call-2")).toBeInTheDocument();
  });

  it("deals a fresh board when the Practice tab leads back to the root", async () => {
    // Board 3: South deals, so nothing bids before the learner.
    window.history.replaceState({}, "", "/bid/3-00000000000000000000000000");
    render(<App />);
    expect(screen.getByTestId("board-line")).toHaveTextContent(/^3 · South/);

    boards.next = ["7-00000000000000000000000000"];
    await act(async () => {
      fireEvent.click(screen.getByRole("link", { name: "Practice" }));
    });
    expect(window.location.pathname).toBe("/");
    expect(screen.getByTestId("board-line")).toHaveTextContent(/^7 · South/);
  });
});
