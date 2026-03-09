import { fetchIcalBookings } from './ical.ts';
import { readManualBookings } from './bookings.ts';
import type { RoomKey } from './config.ts';

export interface AvailableWindow {
  start: string;
  end: string;
  nights: number;
}

export interface RoomAvailability {
  room: RoomKey;
  isAvailableNow: boolean;
  currentBookingEnd: string | null;
  nextAvailable: AvailableWindow | null;
  allWindows: AvailableWindow[];
}

/**
 * Compute the next available window for a room.
 * Looks up to 90 days ahead from today.
 */
export async function getNextAvailable(roomKey: RoomKey): Promise<RoomAvailability> {
  const icalBookings = await fetchIcalBookings(roomKey);
  const manualBookings = readManualBookings().filter((b) => b.room === roomKey || b.room === 'full');

  const allBookings = [...icalBookings, ...manualBookings];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toStr(today);

  // Build a set of booked dates (each date = night starting that day)
  const bookedDates = new Set<string>();
  for (const b of allBookings) {
    const ci = new Date(b.checkin + 'T00:00:00');
    const co = new Date(b.checkout + 'T00:00:00');
    const d = new Date(ci);
    while (d < co) {
      bookedDates.add(toStr(d));
      d.setDate(d.getDate() + 1);
    }
  }

  // Check if today is booked
  const isAvailableNow = !bookedDates.has(todayStr);

  // Find when the current booking ends (if booked now)
  let currentBookingEnd: string | null = null;
  if (!isAvailableNow) {
    const d = new Date(today);
    while (bookedDates.has(toStr(d))) {
      d.setDate(d.getDate() + 1);
    }
    currentBookingEnd = toStr(d);
  }

  // Find all available windows (at least 2 nights) in the look-ahead period
  const lookAhead = 90;
  const allWindows: AvailableWindow[] = [];

  const d = new Date(today);
  for (let i = 0; i < lookAhead; i++) {
    const dStr = toStr(d);
    if (!bookedDates.has(dStr)) {
      const start = new Date(d);
      while (!bookedDates.has(toStr(d)) && i < lookAhead) {
        d.setDate(d.getDate() + 1);
        i++;
      }
      const nights = Math.round((d.getTime() - start.getTime()) / 86400000);
      if (nights >= 2) {
        allWindows.push({ start: toStr(start), end: toStr(d), nights });
      }
    }
    d.setDate(d.getDate() + 1);
  }

  const nextAvailable = allWindows.length > 0 ? allWindows[0] : null;

  return { room: roomKey, isAvailableNow, currentBookingEnd, nextAvailable, allWindows };
}

export async function getAllAvailability(): Promise<Record<string, RoomAvailability>> {
  const rooms: RoomKey[] = ['nest', 'master', 'nomad'];
  const results = await Promise.all(rooms.map((r) => getNextAvailable(r)));
  const map: Record<string, RoomAvailability> = {};
  for (const r of results) map[r.room] = r;
  return map;
}

function toStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
