import type { Booking } from './types.ts';

export function detectConflicts(allBookings: Booking[]): Booking[] {
  const result = allBookings.map((b) => ({ ...b, conflict: false, conflictWith: null as string | null }));

  for (let i = 0; i < result.length; i++) {
    for (let j = i + 1; j < result.length; j++) {
      const a = result[i];
      const b = result[j];

      const sameRoom = a.room === b.room || a.room === 'full' || b.room === 'full';
      if (!sameRoom) continue;

      // Blocked dates can be overridden by direct, friend, or owner bookings
      const overridable = ['direct', 'friend', 'owner'];
      if (
        (a.type === 'blocked' && overridable.includes(b.type)) ||
        (b.type === 'blocked' && overridable.includes(a.type))
      ) continue;

      if (a.checkin < b.checkout && b.checkin < a.checkout) {
        result[i].conflict = true;
        result[i].conflictWith = b.id;
        result[j].conflict = true;
        result[j].conflictWith = a.id;
      }
    }
  }

  return result;
}
