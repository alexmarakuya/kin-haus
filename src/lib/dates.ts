import type { Booking } from './types.ts';

/** Format a Date (or date-like value) to YYYY-MM-DD string. */
export function toDateStr(d: unknown): string | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d as string | number);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Type-safe variant when the input is guaranteed to be a Date. */
export function formatDate(d: Date): string {
  return toDateStr(d)!;
}

export function filterByDateRange(bookings: Booking[], from?: string | null, to?: string | null): Booking[] {
  if (!from && !to) return bookings;
  return bookings.filter((b) => {
    if (from && b.checkout < from) return false;
    if (to && b.checkin > to) return false;
    return true;
  });
}
