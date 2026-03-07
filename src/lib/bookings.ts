import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Booking } from './types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOKINGS_FILE = path.join(__dirname, '..', '..', 'data', 'bookings.json');

export function readManualBookings(): Booking[] {
  try {
    if (!fs.existsSync(BOOKINGS_FILE)) return [];
    const raw = fs.readFileSync(BOOKINGS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err: any) {
    console.error('[bookings] error reading file:', err.message);
    return [];
  }
}

export function writeManualBookings(bookings: Booking[]): void {
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2), 'utf8');
}

const PRICING_FILE = path.join(__dirname, '..', '..', 'data', 'pricing.json');

export function readPricing(): Record<string, number> {
  try {
    if (!fs.existsSync(PRICING_FILE)) return {};
    const raw = fs.readFileSync(PRICING_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function writePricing(pricing: Record<string, number>): void {
  fs.writeFileSync(PRICING_FILE, JSON.stringify(pricing, null, 2), 'utf8');
}
