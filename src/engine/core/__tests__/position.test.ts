// Translated from python/core/tests/test_position.py, plus the parts of
// position.py the Python tests do not reach.

import { describe, it, expect } from "vitest";
import {
  EAST,
  NORTH,
  POSITIONS,
  Position,
  SOUTH,
  WEST,
  comparePositions,
} from "../position";

describe("Position", () => {
  it("comes from a name or a char", () => {
    expect(Position.fromName("South")).toBe(SOUTH);
    expect(Position.fromChar("W")).toBe(WEST);
    expect(() => Position.fromName("Middle")).toThrow();
    expect(() => Position.fromChar("Q")).toThrow();
    expect(() => new Position(0)).toThrow();
    expect(() => Position.fromIndex(4)).toThrow();
  });

  it("knows partner", () => {
    expect(NORTH.partner).toBe(SOUTH);
    expect(EAST.partner).toBe(WEST);
  });

  it("counts the calls between two seats", () => {
    expect(NORTH.callsBetween(NORTH)).toBe(0);
    expect(NORTH.callsBetween(EAST)).toBe(1);
    expect(NORTH.callsBetween(SOUTH)).toBe(2);
    expect(NORTH.callsBetween(WEST)).toBe(3);
    expect(WEST.callsBetween(NORTH)).toBe(1);
  });

  it("names the seats in N E S W order", () => {
    expect(POSITIONS.map((position) => position.char)).toEqual([
      "N",
      "E",
      "S",
      "W",
    ]);
    expect(POSITIONS.map((position) => position.name)).toEqual([
      "North",
      "East",
      "South",
      "West",
    ]);
    expect(`${SOUTH}`).toBe("South");
    expect(comparePositions(NORTH, WEST)).toBeLessThan(0);
    expect(comparePositions(WEST, WEST)).toBe(0);
  });

  it("walks the table", () => {
    expect(NORTH.lho).toBe(EAST);
    expect(NORTH.rho).toBe(WEST);
    expect(WEST.lho).toBe(NORTH);
    expect(WEST.positionAfterNCalls(5)).toBe(NORTH);
    expect(NORTH.positionAfterNCalls(-1)).toBe(WEST);
  });

  it("knows its partnership", () => {
    expect(NORTH.inPartnershipWith(SOUTH)).toBe(true);
    expect(NORTH.inPartnershipWith(NORTH)).toBe(true);
    expect(NORTH.inPartnershipWith(EAST)).toBe(false);
    expect(NORTH.inPartnershipWith(null)).toBe(false);
    expect(NORTH.equals(Position.fromIndex(0))).toBe(true);
    expect(NORTH.equals(null)).toBe(false);
  });
});
