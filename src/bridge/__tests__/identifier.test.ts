import { describe, it, expect } from "vitest";
import {
  encodeDeal,
  decodeDeal,
  dealerFromBoardNumber,
  generateBoardId,
  parseBoardId,
} from "../identifier";
import { randomDeal, MOCK_DEAL } from "../mock";

describe("encodeDeal / decodeDeal", () => {
  it("roundtrips a random deal", () => {
    const deal = randomDeal();
    const hex = encodeDeal(deal);
    expect(hex).toHaveLength(26);
    expect(hex).toMatch(/^[0-9a-f]{26}$/);

    const decoded = decodeDeal(hex);
    expect(decoded).not.toBeNull();
    // Each hand should have 13 cards
    expect(decoded!.north.cards).toHaveLength(13);
    expect(decoded!.east.cards).toHaveLength(13);
    expect(decoded!.south.cards).toHaveLength(13);
    expect(decoded!.west.cards).toHaveLength(13);

    // Re-encoding should produce the same hex
    expect(encodeDeal(decoded!)).toBe(hex);
  });

  it("roundtrips MOCK_DEAL", () => {
    const hex = encodeDeal(MOCK_DEAL);
    const decoded = decodeDeal(hex);
    expect(decoded).not.toBeNull();
    expect(encodeDeal(decoded!)).toBe(hex);
  });

  it("preserves all 52 cards", () => {
    const deal = randomDeal();
    const decoded = decodeDeal(encodeDeal(deal))!;
    const allCards = [
      ...decoded.north.cards,
      ...decoded.east.cards,
      ...decoded.south.cards,
      ...decoded.west.cards,
    ];
    expect(allCards).toHaveLength(52);
    const unique = new Set(allCards.map((c) => `${c.suit}${c.rank}`));
    expect(unique.size).toBe(52);
  });
});

describe("decodeDeal", () => {
  it("returns null for invalid length", () => {
    expect(decodeDeal("abc")).toBeNull();
    expect(decodeDeal("")).toBeNull();
  });

  it("returns null for invalid hex characters", () => {
    expect(decodeDeal("zzzzzzzzzzzzzzzzzzzzzzzzzz")).toBeNull();
  });
});

describe("dealerFromBoardNumber", () => {
  it("returns correct dealers for boards 1-4", () => {
    expect(dealerFromBoardNumber(1)).toBe("N");
    expect(dealerFromBoardNumber(2)).toBe("E");
    expect(dealerFromBoardNumber(3)).toBe("S");
    expect(dealerFromBoardNumber(4)).toBe("W");
  });

  it("cycles for boards 5-8", () => {
    expect(dealerFromBoardNumber(5)).toBe("N");
    expect(dealerFromBoardNumber(6)).toBe("E");
    expect(dealerFromBoardNumber(7)).toBe("S");
    expect(dealerFromBoardNumber(8)).toBe("W");
  });
});

describe("generateBoardId", () => {
  it("returns a valid board number, deal, and id", () => {
    const { boardNumber, deal, id } = generateBoardId();
    expect(boardNumber).toBeGreaterThanOrEqual(1);
    expect(boardNumber).toBeLessThanOrEqual(16);
    expect(deal.north.cards).toHaveLength(13);
    expect(id).toMatch(/^\d{1,2}-[0-9a-f]{26}$/);
  });

  it("id encodes the returned deal", () => {
    const { deal, id } = generateBoardId();
    const parsed = parseBoardId(id);
    expect(parsed).not.toBeNull();
    expect(encodeDeal(parsed!.deal)).toBe(encodeDeal(deal));
  });
});

describe("parseBoardId", () => {
  it("parses a valid board id", () => {
    const { id, boardNumber } = generateBoardId();
    const parsed = parseBoardId(id);
    expect(parsed).not.toBeNull();
    expect(parsed!.boardNumber).toBe(boardNumber);
    expect(parsed!.dealer).toBe(dealerFromBoardNumber(boardNumber));
    expect(parsed!.deal.north.cards).toHaveLength(13);
  });

  it("returns null for invalid ids", () => {
    expect(parseBoardId("")).toBeNull();
    expect(parseBoardId("abc")).toBeNull();
    expect(parseBoardId("0-0000000000000000000000000")).toBeNull();
    expect(parseBoardId("17-0000000000000000000000000")).toBeNull();
  });
});
