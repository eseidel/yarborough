import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgressPage } from "../ProgressPage";
import {
  type RecordStore,
  openRecordStore,
  useRecordStoreForTests,
} from "../../practice/record/db";
import type { HandRecord, RecordedVerdict } from "../../practice/record/types";
import { sampleHand } from "../../practice/record/__tests__/db.test";

const RAISE = ["Responding to an opening", "Raises", "Jump Raise"];
const STAYMAN = ["Responding to an opening", "To 1NT", "Stayman"];
const OPEN = ["Opening", "One of a suit", "One Level Suit Opening"];

function verdict(category: string[], matched: boolean): RecordedVerdict {
  return {
    index: 0,
    call: "P",
    saycCall: "P",
    category,
    matched,
    assisted: false,
  };
}

function hand(
  n: number,
  verdicts: RecordedVerdict[],
  overrides: Partial<HandRecord> = {},
) {
  return sampleHand({
    completedAt: 1_800_000_000_000 + n * 60_000,
    verdicts,
    ...overrides,
  });
}

function PracticeStub() {
  const location = useLocation();
  return (
    <div data-testid="practice-stub">{JSON.stringify(location.state)}</div>
  );
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/progress"]}>
      <Routes>
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="/bid/:boardId" element={<div>Review page</div>} />
        <Route path="/" element={<PracticeStub />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProgressPage", () => {
  let store: RecordStore;

  beforeEach(async () => {
    store = await openRecordStore(new IDBFactory(), "progress-page");
    useRecordStoreForTests(Promise.resolve(store));
  });

  afterEach(() => {
    useRecordStoreForTests(null);
    vi.restoreAllMocks();
  });

  it("invites the user to bid when there is no record", async () => {
    renderPage();
    const empty = await screen.findByTestId("no-record");
    expect(empty).toHaveTextContent("No hands bid yet");
    expect(document.title).toBe("Your Progress - SAYC Bridge");
    expect(
      within(empty).getByRole("link", { name: "Practice" }),
    ).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: /export/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /reset/i })).toBeDisabled();
  });

  it("tells the user how they are doing, in their terms", async () => {
    for (let i = 0; i < 20; i++) {
      await store.addHand(hand(i, [verdict(OPEN, true), verdict(RAISE, true)]));
    }
    for (let i = 20; i < 26; i++) {
      await store.addHand(
        hand(i, [verdict(STAYMAN, i === 25)], {
          contract: "3N",
          declarer: "S",
        }),
      );
    }
    renderPage();

    const overall = await screen.findByTestId("overall");
    expect(within(overall).getByTestId("overall-accuracy")).toHaveTextContent(
      "89%",
    );
    expect(overall).toHaveTextContent(
      "of your calls were the SAYC bid, from 46 calls",
    );
    expect(within(overall).getByTestId("overall-hands")).toHaveTextContent(
      "26 hands bid, 21 entirely on system. Current streak 1. Best streak 20.",
    );
    // No statistics leak into the page.
    expect(overall.textContent).not.toMatch(
      /p ?[=<]|confidence|interval|%\s*sure/i,
    );
    expect(screen.getByTestId("accuracy-chart")).toBeInTheDocument();

    const opportunities = screen.getByTestId("opportunities");
    expect(opportunities).toHaveTextContent("To 1NT");
    expect(opportunities).toHaveTextContent("Weak spot");
    expect(opportunities).toHaveTextContent("17%");
    expect(opportunities).toHaveTextContent("from 6 calls, so early days");
    expect(
      within(opportunities).getByRole("button", { name: /practice this/i }),
    ).toBeInTheDocument();

    const strengths = screen.getByTestId("strengths");
    expect(strengths).toHaveTextContent("Raises");
    expect(strengths).toHaveTextContent("One of a suit");

    // The tree opens level by level.
    const tree = screen.getByTestId("category-tree");
    expect(within(tree).queryByText("To 1NT")).toBeNull();
    fireEvent.click(
      within(tree).getByRole("button", {
        name: /expand responding to an opening/i,
      }),
    );
    expect(within(tree).getByText("To 1NT")).toBeInTheDocument();
    fireEvent.click(
      within(tree).getByRole("button", { name: /expand to 1nt/i }),
    );
    expect(within(tree).getByText("Stayman")).toBeInTheDocument();

    // Recent hands, newest first, each opening its review.
    const recent = within(screen.getByTestId("recent")).getAllByRole("link");
    expect(recent).toHaveLength(20);
    expect(recent[0]).toHaveTextContent("3NT by South");
    expect(recent[0]).toHaveTextContent("On system");
    expect(recent[1]).toHaveTextContent("Missed: To 1NT");
    expect(recent[0]).toHaveAttribute(
      "href",
      "/bid/1-00000000000000000000000000:1S,P,3S,P,4S,P,P,P",
    );
  });

  it("sends Practice this to the practice page, aimed at that weak spot", async () => {
    for (let i = 0; i < 10; i++) {
      await store.addHand(
        hand(i, [verdict(OPEN, true), verdict(STAYMAN, false)]),
      );
    }
    renderPage();
    const opportunities = await screen.findByTestId("opportunities");
    fireEvent.click(
      within(opportunities).getByRole("button", { name: /practice this/i }),
    );
    const stub = await screen.findByTestId("practice-stub");
    expect(JSON.parse(stub.textContent!)).toEqual({
      dealAdaptive: { targets: [["Responding to an opening", "To 1NT"]] },
    });
    expect(await store.getSetting("focus")).toBe("Adaptive");
    expect(await store.getSetting("adaptiveTargets")).toEqual([
      ["Responding to an opening", "To 1NT"],
    ]);
  });

  it("shows the chart's figures for a tapped block", async () => {
    for (let i = 0; i < 45; i++) {
      await store.addHand(hand(i, [verdict(OPEN, i % 3 !== 0)]));
    }
    renderPage();
    await screen.findByTestId("accuracy-chart");
    expect(screen.getByTestId("chart-caption")).toHaveTextContent(
      "Each point is a block of hands",
    );
    fireEvent.click(screen.getByTestId("block-21"));
    expect(screen.getByTestId("chart-caption")).toHaveTextContent(
      "Hands 21–40: 13 of 20 calls on system",
    );
  });

  it("exports and resets the record", async () => {
    await store.addHand(hand(0, [verdict(OPEN, true)]));
    const createObjectURL = vi.fn(() => "blob:record");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /export/i }));
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:record");

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(await store.allHands()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    fireEvent.click(screen.getByRole("button", { name: /yes, delete/i }));
    await waitFor(async () => expect(await store.allHands()).toEqual([]));
    expect(await screen.findByTestId("no-record")).toBeInTheDocument();
  });
});
