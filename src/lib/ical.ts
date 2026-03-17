import ical from 'node-ical';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ICAL_SOURCES, ROOMS } from './config.ts';
import type { RoomKey } from './config.ts';
import type { Booking } from './types.ts';
import { isCacheValid, getCachedBookings, setCachedBookings } from './cache.ts';
import { toDateStr } from './dates.ts';

// ─── AIRBNB ARCHIVE ────────────────────────────────────────────────────────
// Persists every Airbnb booking ever seen from iCal feeds so they survive
// after Airbnb drops them from their export (typically ~60 days past checkout).
const ARCHIVE_FILE = path.join(process.cwd(), 'data', 'airbnb-archive.json');

function readArchive(): Booking[] {
  try {
    if (!fs.existsSync(ARCHIVE_FILE)) return [];
    return JSON.parse(fs.readFileSync(ARCHIVE_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeArchive(bookings: Booking[]): void {
  fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(bookings, null, 2), 'utf8');
}

/** Merge live iCal bookings into the persistent archive. Returns count of newly archived. */
function archiveBookings(live: Booking[]): number {
  const archive = readArchive();
  const existingIds = new Set(archive.map((b) => b.id));
  let added = 0;
  for (const b of live) {
    if (!existingIds.has(b.id)) {
      archive.push({ ...b, archivedAt: new Date().toISOString() } as any);
      existingIds.add(b.id);
      added++;
    }
  }
  if (added > 0) {
    writeArchive(archive);
    console.log(`[ical-archive] persisted ${added} new booking(s)`);
  }
  return added;
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

    // Persist to archive before caching
    archiveBookings(bookings);

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
  const liveBookings = [...nest, ...master, ...nomad];

  // Merge in archived bookings that are no longer in the live feed
  const liveIds = new Set(liveBookings.map((b) => b.id));
  const archived = readArchive().filter((b) => !liveIds.has(b.id));

  if (archived.length > 0) {
    console.log(`[ical-archive] restored ${archived.length} booking(s) from archive`);
  }

  return [...liveBookings, ...archived.map((b) => ({ ...b, source: 'ical' as const }))];
}
