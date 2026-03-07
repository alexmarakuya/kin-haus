import type { Booking } from './types.ts';

export function filterByDateRange(bookings: Booking[], from?: string | null, to?: string | null): Booking[] {
  if (!from && !to) return bookings;
  return bookings.filter((b) => {
    if (from && b.checkout < from) return false;
    if (to && b.checkin > to) return false;
    return true;
  });
}
