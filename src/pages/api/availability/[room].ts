import type { APIRoute } from 'astro';
import { fetchIcalBookings } from '../../../lib/ical.ts';
import { readManualBookings } from '../../../lib/bookings.ts';
import { formatDate } from '../../../lib/dates.ts';
import { ROOMS } from '../../../lib/config.ts';
import type { RoomKey } from '../../../lib/config.ts';
import { json, jsonError } from '../../../lib/api-response.ts';

export const GET: APIRoute = async ({ params }) => {
  const room = params.room as string;

  if (!ROOMS.includes(room as RoomKey)) {
    return jsonError('Invalid room. Use: nest, master, or nomad');
  }

  try {
    const roomKey = room as RoomKey;
    const icalBookings = await fetchIcalBookings(roomKey);
    const manualBookings = readManualBookings().filter((b) => (b.room === roomKey || b.room === 'full') && b.type !== 'waitlist');
    const allBookings = [...icalBookings, ...manualBookings];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxDate = new Date(today.getFullYear(), 11, 31); // End of current year

    // Build set of booked dates (same logic as availability.ts)
    const bookedDates = new Set<string>();
    for (const b of allBookings) {
      const ci = new Date(b.checkin + 'T00:00:00');
      const co = new Date(b.checkout + 'T00:00:00');
      const d = new Date(ci);
      while (d < co) {
        const dStr = formatDate(d);
        // Only include dates within our range
        if (d >= today && d <= maxDate) {
          bookedDates.add(dStr);
        }
        d.setDate(d.getDate() + 1);
      }
    }

    return json(
      {
        room: roomKey,
        bookedDates: Array.from(bookedDates).sort(),
        range: { min: formatDate(today), max: formatDate(maxDate) },
      },
      200,
      { 'Cache-Control': 'public, max-age=300' }
    );
  } catch (err: any) {
    console.error(`[api] /api/availability/${room} error:`, err.message);
    return jsonError('Failed to fetch availability', 500);
  }
};
