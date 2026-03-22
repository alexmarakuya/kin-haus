import type { APIRoute } from 'astro';
import { findHousekeeperByToken } from '../../../lib/housekeepers.ts';
import { readHousekeeping } from '../../../lib/housekeeping.ts';
import { readManualBookings } from '../../../lib/bookings.ts';
import { fetchAllIcalBookings } from '../../../lib/ical.ts';
import { ROOM_LABELS } from '../../../lib/constants.ts';
import type { Booking, HousekeepingStatus } from '../../../lib/types.ts';

function escapeIcal(str: string): string {
  return str.replace(/[\\;,]/g, c => '\\' + c).replace(/\n/g, '\\n');
}

function formatIcalDate(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

function statusLabel(status: HousekeepingStatus): string {
  switch (status) {
    case 'needs_cleaning': return 'Needs cleaning';
    case 'in_progress': return 'In progress';
    case 'done': return 'Done';
  }
}

// Generate cleaning events from bookings for the next 90 days
function getCleaningEvents(
  bookings: Booking[],
  assignedRooms: string[],
  availableDays: number[],
  hkData: Record<string, HousekeepingStatus>
): Array<{ date: string; room: string; status: HousekeepingStatus; guest?: string }> {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + 90);

  const events: Array<{ date: string; room: string; status: HousekeepingStatus; guest?: string }> = [];
  const seen = new Set<string>();

  for (const b of bookings) {
    // Skip non-cleaning booking types
    if (b.type === 'blocked' || b.type === 'owner' || b.type === 'waitlist') continue;

    const room = b.room === 'full' ? assignedRooms : [b.room];
    for (const r of room) {
      if (!assignedRooms.includes(r)) continue;

      const checkoutDate = new Date(b.checkout + 'T12:00:00');
      if (checkoutDate < today || checkoutDate > end) continue;

      const dayOfWeek = checkoutDate.getDay();
      if (!availableDays.includes(dayOfWeek)) continue;

      const key = `${b.checkout}:${r}`;
      if (seen.has(key)) continue;
      seen.add(key);

      events.push({
        date: b.checkout,
        room: r,
        status: hkData[key] || 'needs_cleaning',
        guest: b.guest,
      });
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

export const GET: APIRoute = async ({ url }) => {
  const token = url.searchParams.get('token');
  if (!token) {
    return new Response('Missing token', { status: 401 });
  }

  const hk = findHousekeeperByToken(token);
  if (!hk) {
    return new Response('Invalid or inactive token', { status: 403 });
  }

  // Fetch all bookings
  const [icalBookings, manualBookings] = await Promise.all([
    fetchAllIcalBookings(),
    Promise.resolve(readManualBookings()),
  ]);
  const allBookings = [...icalBookings, ...manualBookings];
  const hkData = readHousekeeping();

  const events = getCleaningEvents(allBookings, hk.assignedRooms, hk.availableDays, hkData);

  // Build iCalendar
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kin Haus//Housekeeping//EN',
    `X-WR-CALNAME:${escapeIcal(hk.name)} - Kin Haus Cleaning`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    // Refresh every 30 minutes
    'X-PUBLISHED-TTL:PT30M',
    'REFRESH-INTERVAL;VALUE=DURATION:PT30M',
  ];

  for (const evt of events) {
    const roomName = ROOM_LABELS[evt.room] || evt.room;
    const uid = `hk-${evt.date}-${evt.room}@kinhaus.space`;
    const dateFormatted = formatIcalDate(evt.date);
    const label = statusLabel(evt.status);
    const prefix = evt.status === 'done' ? '\u2705 ' : evt.status === 'in_progress' ? '\u23f3 ' : '\ud83e\uddf9 ';

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTART;VALUE=DATE:${dateFormatted}`,
      `DTEND;VALUE=DATE:${dateFormatted}`,
      `SUMMARY:${prefix}Clean ${escapeIcal(roomName)}`,
      `DESCRIPTION:${escapeIcal(`Status: ${label}${evt.guest ? `\\nAfter checkout: ${evt.guest}` : ''}`)}`,
      `CATEGORIES:Housekeeping`,
      `STATUS:${evt.status === 'done' ? 'COMPLETED' : 'CONFIRMED'}`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');

  return new Response(lines.join('\r\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${hk.name.replace(/\s+/g, '-').toLowerCase()}-housekeeping.ics"`,
      'Cache-Control': 'no-cache, max-age=0',
    },
  });
};
