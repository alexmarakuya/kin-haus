import { describe, it, expect } from "vitest";
import { toDateStr, formatDate, filterByDateRange } from "./dates.ts";
import type { Booking } from "./types.ts";

describe("toDateStr", () => {
  it("formats a Date object to YYYY-MM-DD", () => {
    expect(toDateStr(new Date(2025, 0, 15))).toBe("2025-01-15");
  });

  it("pads single-digit months and days", () => {
    expect(toDateStr(new Date(2025, 2, 5))).toBe("2025-03-05");
  });

  it("handles a date string input", () => {
    expect(toDateStr("2025-06-01T00:00:00")).toBe("2025-06-01");
  });

  it("returns null for falsy input", () => {
    expect(toDateStr(null)).toBeNull();
    expect(toDateStr(undefined)).toBeNull();
    expect(toDateStr("")).toBeNull();
  });
});

describe("formatDate", () => {
  it("returns a YYYY-MM-DD string for a Date", () => {
    expect(formatDate(new Date(2025, 11, 25))).toBe("2025-12-25");
  });
});

describe("filterByDateRange", () => {
  const bookings: Booking[] = [
    {
      id: "1",
      guest: "A",
      type: "direct",
      room: "nest",
      checkin: "2025-01-01",
      checkout: "2025-01-05",
      amount: 0,
      notes: "",
    },
    {
      id: "2",
      guest: "B",
      type: "direct",
      room: "nest",
      checkin: "2025-02-01",
      checkout: "2025-02-10",
      amount: 0,
      notes: "",
    },
    {
      id: "3",
      guest: "C",
      type: "direct",
      room: "nest",
      checkin: "2025-03-15",
      checkout: "2025-03-20",
      amount: 0,
      notes: "",
    },
  ];

  it("returns all bookings when no range is specified", () => {
    expect(filterByDateRange(bookings)).toHaveLength(3);
  });

  it('filters bookings that check out before the "from" date', () => {
    const result = filterByDateRange(bookings, "2025-02-01");
    expect(result.map((b) => b.id)).toEqual(["2", "3"]);
  });

  it('filters bookings that check in after the "to" date', () => {
    const result = filterByDateRange(bookings, null, "2025-02-15");
    expect(result.map((b) => b.id)).toEqual(["1", "2"]);
  });

  it("applies both from and to filters", () => {
    const result = filterByDateRange(bookings, "2025-01-10", "2025-03-01");
    expect(result.map((b) => b.id)).toEqual(["2"]);
  });
});
