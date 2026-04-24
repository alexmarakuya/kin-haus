import { describe, it, expect } from "vitest";
import { detectConflicts } from "./conflicts.ts";
import type { Booking } from "./types.ts";

function makeBooking(
  overrides: Partial<Booking> & Pick<Booking, "id" | "room" | "checkin" | "checkout">,
): Booking {
  return {
    guest: "Test Guest",
    type: "direct",
    amount: 0,
    notes: "",
    ...overrides,
  };
}

describe("detectConflicts", () => {
  it("returns bookings unchanged when there are no overlaps", () => {
    const bookings = [
      makeBooking({ id: "a", room: "nest", checkin: "2025-01-01", checkout: "2025-01-05" }),
      makeBooking({ id: "b", room: "nest", checkin: "2025-01-05", checkout: "2025-01-10" }),
    ];
    const result = detectConflicts(bookings);
    expect(result.every((b) => !b.conflict)).toBe(true);
  });

  it("detects overlapping bookings in the same room", () => {
    const bookings = [
      makeBooking({ id: "a", room: "nest", checkin: "2025-01-01", checkout: "2025-01-05" }),
      makeBooking({ id: "b", room: "nest", checkin: "2025-01-03", checkout: "2025-01-08" }),
    ];
    const result = detectConflicts(bookings);
    expect(result[0].conflict).toBe(true);
    expect(result[0].conflictWith).toBe("b");
    expect(result[1].conflict).toBe(true);
    expect(result[1].conflictWith).toBe("a");
  });

  it("does not flag overlaps in different rooms", () => {
    const bookings = [
      makeBooking({ id: "a", room: "nest", checkin: "2025-01-01", checkout: "2025-01-05" }),
      makeBooking({ id: "b", room: "nomad", checkin: "2025-01-03", checkout: "2025-01-08" }),
    ];
    const result = detectConflicts(bookings);
    expect(result.every((b) => !b.conflict)).toBe(true);
  });

  it("flags conflicts when one booking is for the full villa", () => {
    const bookings = [
      makeBooking({ id: "a", room: "nest", checkin: "2025-01-01", checkout: "2025-01-05" }),
      makeBooking({ id: "b", room: "full", checkin: "2025-01-03", checkout: "2025-01-08" }),
    ];
    const result = detectConflicts(bookings);
    expect(result[0].conflict).toBe(true);
    expect(result[1].conflict).toBe(true);
  });

  it("allows blocked bookings to be overridden by direct/friend/owner/hold", () => {
    const overridableTypes = ["direct", "friend", "owner", "hold"] as const;
    for (const type of overridableTypes) {
      const bookings = [
        makeBooking({
          id: "blocked",
          room: "nest",
          checkin: "2025-01-01",
          checkout: "2025-01-10",
          type: "blocked",
        }),
        makeBooking({
          id: "override",
          room: "nest",
          checkin: "2025-01-03",
          checkout: "2025-01-08",
          type,
        }),
      ];
      const result = detectConflicts(bookings);
      expect(result.every((b) => !b.conflict)).toBe(true);
    }
  });

  it("flags conflict between two blocked bookings", () => {
    const bookings = [
      makeBooking({
        id: "a",
        room: "nest",
        checkin: "2025-01-01",
        checkout: "2025-01-10",
        type: "blocked",
      }),
      makeBooking({
        id: "b",
        room: "nest",
        checkin: "2025-01-05",
        checkout: "2025-01-15",
        type: "blocked",
      }),
    ];
    const result = detectConflicts(bookings);
    expect(result[0].conflict).toBe(true);
    expect(result[1].conflict).toBe(true);
  });

  it("never flags waitlist bookings as conflicts", () => {
    const bookings = [
      makeBooking({ id: "a", room: "nest", checkin: "2025-01-01", checkout: "2025-01-10" }),
      makeBooking({
        id: "w",
        room: "nest",
        checkin: "2025-01-05",
        checkout: "2025-01-15",
        type: "waitlist",
      }),
    ];
    const result = detectConflicts(bookings);
    expect(result.every((b) => !b.conflict)).toBe(true);
  });

  it("handles an empty list", () => {
    expect(detectConflicts([])).toEqual([]);
  });
});
