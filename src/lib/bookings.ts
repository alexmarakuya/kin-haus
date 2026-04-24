import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./paths.ts";
import { fetchAllIcalBookings } from "./ical.ts";
import type { Booking, BookingOverrides } from "./types.ts";

const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");

export function readManualBookings(): Booking[] {
  try {
    if (!fs.existsSync(BOOKINGS_FILE)) return [];
    const raw = fs.readFileSync(BOOKINGS_FILE, "utf8");
    return JSON.parse(raw);
  } catch (err: any) {
    console.error("[bookings] error reading file:", err.message);
    return [];
  }
}

export function writeManualBookings(bookings: Booking[]): void {
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2), "utf8");
}

const OVERRIDES_FILE = path.join(DATA_DIR, "overrides.json");

export function readOverrides(): BookingOverrides {
  try {
    if (!fs.existsSync(OVERRIDES_FILE)) return {};
    const raw = fs.readFileSync(OVERRIDES_FILE, "utf8");
    const data = JSON.parse(raw);
    const result: BookingOverrides = {};
    for (const [k, v] of Object.entries(data)) {
      result[k] = typeof v === "number" ? { amount: v } : (v as any);
    }
    return result;
  } catch {
    return {};
  }
}

export function writeOverrides(overrides: BookingOverrides): void {
  fs.writeFileSync(OVERRIDES_FILE, JSON.stringify(overrides, null, 2), "utf8");
}

/**
 * Merge live Airbnb iCal bookings with manual bookings, applying overrides.
 * Single source of truth used by the dashboard chat, bookings API, and stats.
 */
export async function getMergedBookings(): Promise<Booking[]> {
  const [ical, manual] = await Promise.all([
    fetchAllIcalBookings(),
    Promise.resolve(readManualBookings()),
  ]);
  const overrides = readOverrides();
  return [...ical, ...manual].map((b) => {
    const ov = overrides[b.id];
    if (!ov) return b;
    return {
      ...b,
      amount: ov.amount !== undefined ? ov.amount : b.amount,
      guest: ov.guest !== undefined ? ov.guest : b.guest,
      notes: ov.notes !== undefined ? ov.notes : b.notes,
    };
  });
}

// Keep old helpers for backward compat
export function readPricing(): Record<string, number> {
  const ov = readOverrides();
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(ov)) {
    if (v.amount !== undefined) result[k] = v.amount;
  }
  return result;
}

export function writePricing(pricing: Record<string, number>): void {
  const ov = readOverrides();
  for (const [k, v] of Object.entries(pricing)) {
    ov[k] = { ...ov[k], amount: v };
  }
  writeOverrides(ov);
}
