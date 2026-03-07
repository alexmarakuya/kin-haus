import ical from 'node-ical';
import crypto from 'node:crypto';
import { ICAL_SOURCES, ROOMS } from './config.ts';
import type { RoomKey } from './config.ts';
import type { Booking } from './types.ts';
import { isCacheValid, getCachedBookings, setCachedBookings } from './cache.ts';

function toDateStr(d: unknown): string | null {
  if (!d) return null;
  const date = new Date(d as string | number | Date);
  return date.toISOString().split('T')[0];
}

export async function fetchIcalBookings(roomKey: RoomKey, forceRefresh = false): Promise<Booking[]> {
  if (!forceRefresh && isCacheValid(roomKey)) {
    console.log(`[ical] cache hit: ${roomKey}`);
    return getCachedBookings(roomKey) || [];
  }

  const source = ICAL_SOURCES[roomKey];
  console.log(`[ical] fetching ${roomKey}...`);

  try {
    const events = await ical.async.fromURL(source.url);
    const bookings: Booking[] = [];

    for (const key of Object.keys(events)) {
      const event = events[key];
      if (event.type !== 'VEVENT') continue;

      const summary = (event as any).summary || '';
      const checkin = toDateStr((event as any).start);
      const checkout = toDateStr((event as any).end);

      if (!checkin || !checkout) continue;

      const isReserved =
        summary.toLowerCase().includes('reserved') ||
        summary.toLowerCase().includes('reservation');
      const isBlock =
        summary.toLowerCase().includes('not available') ||
        summary.toLowerCase().includes('blocked') ||
        summary.toLowerCase().includes('unavailable');

      let resCode = '';
      let guestPhone = '';
      const desc = (event as any).description || '';
      const resMatch = desc.match(/reservations\/details\/([A-Z0-9]+)/);
      const phoneMatch = desc.match(/Phone Number \(Last 4 Digits\): (\d{4})/);
      if (resMatch) resCode = resMatch[1];
      if (phoneMatch) guestPhone = phoneMatch[1];

      bookings.push({
        id: `airbnb-${roomKey}-${crypto.createHash('md5').update(key).digest('hex').slice(0, 8)}`,
        guest: resCode ? `Guest ···${guestPhone}` : isBlock ? 'Blocked' : 'Airbnb Guest',
        type: isBlock ? 'blocked' : 'airbnb',
        room: roomKey,
        checkin,
        checkout,
        amount: 0,
        notes: resCode ? `Res: ${resCode}` : isBlock ? 'Airbnb — Not available' : '',
        source: 'ical',
      });
    }

    setCachedBookings(roomKey, bookings);
    console.log(`[ical] ${roomKey}: ${bookings.length} events`);
    return bookings;
  } catch (err: any) {
    console.error(`[ical] error fetching ${roomKey}:`, err.message);
    const cached = getCachedBookings(roomKey);
    if (cached) {
      console.warn(`[ical] returning stale cache for ${roomKey}`);
      return cached;
    }
    return [];
  }
}

export async function fetchAllIcalBookings(forceRefresh = false): Promise<Booking[]> {
  const [nest, master, nomad] = await Promise.all(
    ROOMS.map((room) => fetchIcalBookings(room, forceRefresh))
  );
  return [...nest, ...master, ...nomad];
}
