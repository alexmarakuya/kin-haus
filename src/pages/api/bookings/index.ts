import type { APIRoute } from 'astro';
import { fetchAllIcalBookings } from '../../../lib/ical.ts';
import { readManualBookings, writeManualBookings, readOverrides } from '../../../lib/bookings.ts';
import { detectConflicts } from '../../../lib/conflicts.ts';
import { filterByDateRange } from '../../../lib/dates.ts';
import { getLastSyncTimes } from '../../../lib/cache.ts';
import { VALID_BOOKING_TYPES, VALID_ROOMS } from '../../../lib/constants.ts';
import { json, jsonError } from '../../../lib/api-response.ts';

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const forceRefresh = url.searchParams.get('refresh') === 'true';

  try {
    const icalBookings = await fetchAllIcalBookings(forceRefresh);
    const manualBookings = readManualBookings().map((b) => ({ ...b, source: 'manual' as const }));
    const overrides = readOverrides();
    const allBookings = [...icalBookings, ...manualBookings].map((b) => {
      const ov = overrides[b.id];
      if (!ov) return b;
      return {
        ...b,
        amount: ov.amount !== undefined ? ov.amount : b.amount,
        guest: ov.guest !== undefined ? ov.guest : b.guest,
        notes: ov.notes !== undefined ? ov.notes : b.notes,
      };
    });

    const filtered = filterByDateRange(allBookings, from, to);
    const withConflicts = detectConflicts(filtered);

    return json({
      bookings: withConflicts,
      meta: {
        total: withConflicts.length,
        ical: icalBookings.length,
        manual: manualBookings.length,
        conflicts: withConflicts.filter((b) => b.conflict).length,
        lastSync: getLastSyncTimes(),
      },
    });
  } catch (err: any) {
    console.error('[api] /api/bookings error:', err);
    return jsonError('Failed to fetch bookings', 500, err.message);
  }
};

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  const { guest, type, room, checkin, checkout, amount, notes } = body;

  if (!checkin || !checkout || checkin >= checkout) {
    return jsonError('Invalid check-in / check-out dates');
  }

  if (!VALID_BOOKING_TYPES.includes(type)) {
    return jsonError(`type must be one of: ${VALID_BOOKING_TYPES.join(', ')}`);
  }

  if (!VALID_ROOMS.includes(room)) {
    return jsonError(`room must be one of: ${VALID_ROOMS.join(', ')}`);
  }

  const bookings = readManualBookings();
  const newBooking = {
    id: `manual-${Date.now()}`,
    guest: guest || 'Guest',
    type,
    room,
    checkin,
    checkout,
    amount: parseFloat(amount) || 0,
    notes: notes || '',
  };

  bookings.push(newBooking);
  writeManualBookings(bookings);

  console.log(`[bookings] added: ${newBooking.id} — ${newBooking.guest} (${room}, ${checkin}–${checkout})`);
  return json(newBooking, 201);
};
