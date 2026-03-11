import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_PRICING } from '../constants.ts';
import { readDiscountCodes } from '../discount-codes.ts';

export interface PriceBreakdown {
  room: string;
  checkin: string;
  checkout: string;
  nights: number;
  highSeasonNights: number;
  lowSeasonNights: number;
  highRate: number;
  lowRate: number;
  subtotal: number;
  discount: number;
  discountPercent: number;
  discountReason: string | null;
  promoCode: string | null;
  promoDiscount: number;
  total: number;
  perNight: number;
  currency: string;
}

interface RoomRates {
  high: number;
  low: number;
}

/**
 * Read current room rates from data/pricing.json, falling back to defaults.
 */
function readCurrentRates(): Record<string, RoomRates> {
  try {
    const pricingPath = path.join(process.cwd(), 'data', 'pricing.json');
    if (fs.existsSync(pricingPath)) {
      return JSON.parse(fs.readFileSync(pricingPath, 'utf8'));
    }
  } catch { /* fall through */ }
  return DEFAULT_PRICING as Record<string, RoomRates>;
}

/**
 * Determine whether a given date falls in high season (Nov-Mar) or low season (Apr-Oct).
 */
function isHighSeason(date: Date): boolean {
  const month = date.getMonth(); // 0-indexed
  return month >= 10 || month <= 2; // Nov(10), Dec(11), Jan(0), Feb(1), Mar(2)
}

/**
 * Calculate the total price for a stay, accounting for:
 * - Seasonal rates (high: Nov-Mar, low: Apr-Oct)
 * - Long-stay discounts (7+ nights = 15%, 28+ nights = 40%)
 * - Optional promo code
 */
export function calculatePrice(
  room: string,
  checkin: string,
  checkout: string,
  promoCode?: string
): PriceBreakdown {
  const rates = readCurrentRates();
  const roomRates = rates[room] || DEFAULT_PRICING[room];
  if (!roomRates) {
    throw new Error(`Unknown room: ${room}`);
  }

  const ci = new Date(checkin + 'T12:00:00');
  const co = new Date(checkout + 'T12:00:00');
  const nights = Math.round((co.getTime() - ci.getTime()) / 86400000);

  if (nights <= 0) {
    throw new Error('Checkout must be after checkin');
  }

  // Walk each night and apply the correct seasonal rate
  let highSeasonNights = 0;
  let lowSeasonNights = 0;
  let subtotal = 0;
  const d = new Date(ci);
  for (let i = 0; i < nights; i++) {
    if (isHighSeason(d)) {
      subtotal += roomRates.high;
      highSeasonNights++;
    } else {
      subtotal += roomRates.low;
      lowSeasonNights++;
    }
    d.setDate(d.getDate() + 1);
  }

  // Long-stay discount
  let discountPercent = 0;
  let discountReason: string | null = null;
  if (nights >= 28) {
    discountPercent = 40;
    discountReason = 'Monthly stay (28+ nights): 40% off';
  } else if (nights >= 7) {
    discountPercent = 15;
    discountReason = 'Weekly stay (7+ nights): 15% off';
  }

  const longStayDiscount = Math.round(subtotal * (discountPercent / 100));
  let afterLongStay = subtotal - longStayDiscount;

  // Promo code
  let promoDiscount = 0;
  let validPromo: string | null = null;
  if (promoCode) {
    const codes = readDiscountCodes();
    const match = codes.find(
      (c) => c.code.toLowerCase() === promoCode.toLowerCase() && c.active
    );
    if (match) {
      promoDiscount = Math.round(afterLongStay * (match.discount / 100));
      validPromo = match.code;
    }
  }

  const total = afterLongStay - promoDiscount;
  const perNight = Math.round(total / nights);

  return {
    room,
    checkin,
    checkout,
    nights,
    highSeasonNights,
    lowSeasonNights,
    highRate: roomRates.high,
    lowRate: roomRates.low,
    subtotal,
    discount: longStayDiscount,
    discountPercent,
    discountReason,
    promoCode: validPromo,
    promoDiscount,
    total,
    perNight,
    currency: 'THB',
  };
}

/**
 * Get current rates for all rooms (for the lookup_pricing tool).
 */
export function getCurrentRates(): Record<string, RoomRates> {
  return readCurrentRates();
}

/**
 * Validate a promo code and return its discount info.
 */
export function validatePromoCode(code: string): { valid: boolean; code?: string; discount?: number; note?: string } {
  const codes = readDiscountCodes();
  const match = codes.find(
    (c) => c.code.toLowerCase() === code.toLowerCase() && c.active
  );
  if (!match) return { valid: false };
  return { valid: true, code: match.code, discount: match.discount, note: match.note };
}
