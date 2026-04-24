import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculatePrice } from "./pricing-calculator.ts";

// Mock the fs-based readCurrentRates and discount code reader
vi.mock("node:fs", () => ({
  default: {
    existsSync: () => false,
    readFileSync: () => "{}",
  },
}));

vi.mock("../discount-codes.ts", () => ({
  readDiscountCodes: () => [
    {
      id: "1",
      code: "FRIEND20",
      discount: 20,
      note: "Friends",
      active: true,
      createdAt: "2025-01-01",
    },
    { id: "2", code: "EXPIRED", discount: 10, note: "Old", active: false, createdAt: "2025-01-01" },
  ],
}));

describe("calculatePrice", () => {
  it("calculates a simple high-season stay for The Nest", () => {
    // Jan 1-4 = 3 nights, all high season
    const result = calculatePrice("nest", "2025-01-01", "2025-01-04");
    expect(result.nights).toBe(3);
    expect(result.highSeasonNights).toBe(3);
    expect(result.lowSeasonNights).toBe(0);
    expect(result.subtotal).toBe(5000 * 3);
    expect(result.discount).toBe(0);
    expect(result.total).toBe(15000);
    expect(result.currency).toBe("THB");
  });

  it("calculates a simple low-season stay for The Nest", () => {
    // Jun 1-4 = 3 nights, all low season
    const result = calculatePrice("nest", "2025-06-01", "2025-06-04");
    expect(result.nights).toBe(3);
    expect(result.highSeasonNights).toBe(0);
    expect(result.lowSeasonNights).toBe(3);
    expect(result.subtotal).toBe(3500 * 3);
    expect(result.total).toBe(10500);
  });

  it("applies 15% discount for weekly stays (7+ nights)", () => {
    const result = calculatePrice("nomad", "2025-01-01", "2025-01-08");
    expect(result.nights).toBe(7);
    expect(result.discountPercent).toBe(15);
    expect(result.discount).toBe(Math.round(result.subtotal * 0.15));
    expect(result.total).toBe(result.subtotal - result.discount);
  });

  it("applies 40% discount for monthly stays (28+ nights)", () => {
    // 28 nights entirely in high season (Jan)
    const result = calculatePrice("nomad", "2025-01-01", "2025-01-29");
    expect(result.nights).toBe(28);
    expect(result.discountPercent).toBe(40);
    expect(result.discount).toBe(Math.round(result.subtotal * 0.4));
    expect(result.total).toBe(result.subtotal - result.discount);
  });

  it("applies a valid promo code on top of long-stay discount", () => {
    // 7 nights = 15% long-stay, then 20% promo on remainder
    const result = calculatePrice("nest", "2025-01-01", "2025-01-08", "FRIEND20");
    const afterLongStay = result.subtotal - result.discount;
    expect(result.promoCode).toBe("FRIEND20");
    expect(result.promoDiscount).toBe(Math.round(afterLongStay * 0.2));
    expect(result.total).toBe(afterLongStay - result.promoDiscount);
  });

  it("ignores inactive promo codes", () => {
    const result = calculatePrice("nest", "2025-01-01", "2025-01-04", "EXPIRED");
    expect(result.promoCode).toBeNull();
    expect(result.promoDiscount).toBe(0);
  });

  it("handles mixed-season stays correctly", () => {
    // Mar 30 to Apr 2 = 3 nights: Mar 30 (high), Mar 31 (high), Apr 1 (low)
    const result = calculatePrice("nest", "2025-03-30", "2025-04-02");
    expect(result.nights).toBe(3);
    expect(result.highSeasonNights).toBe(2);
    expect(result.lowSeasonNights).toBe(1);
    expect(result.subtotal).toBe(5000 * 2 + 3500 * 1);
  });

  it("throws for unknown rooms", () => {
    expect(() => calculatePrice("penthouse", "2025-01-01", "2025-01-03")).toThrow("Unknown room");
  });

  it("throws when checkout is before checkin", () => {
    expect(() => calculatePrice("nest", "2025-01-05", "2025-01-01")).toThrow(
      "Checkout must be after checkin",
    );
  });

  it("calculates per-night average correctly", () => {
    const result = calculatePrice("master", "2025-01-01", "2025-01-04");
    expect(result.perNight).toBe(Math.round(result.total / result.nights));
  });
});
