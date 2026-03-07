import type { APIRoute } from 'astro';
import { fetchAllIcalBookings } from '../../../lib/ical.ts';
import { readManualBookings, writeManualBookings, readPricing } from '../../../lib/bookings.ts';
import { detectConflicts } from '../../../lib/conflicts.ts';
import { filterByDateRange } from '../../../lib/dates.ts';
import { getLastSyncTimes } from '../../../lib/cache.ts';

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const forceRefresh = url.searchParams.get('refresh') === 'true';

  try {
    const icalBookings = await fetchAllIcalBookings(forceRefresh);
    const manualBookings = readManualBookings().map((b) => ({ ...b, source: 'manual' as const }));
    const pricing = readPricing();
    const allBookings = [...icalBookings, ...manualBookings].map((b) => ({
      ...b,
      amount: pricing[b.id] !== undefined ? pricing[b.id] : b.amount,
    }));

    const filtered = filterByDateRange(allBookings, from, to);
    const withConflicts = detectConflicts(filtered);

    return new Response(
      JSON.stringify({
        bookings: withConflicts,
        meta: {
          total: withConflicts.length,
          ical: icalBookings.length,
          manual: manualBookings.length,
          conflicts: withConflicts.filter((b) => b.conflict).length,
          lastSync: getLastSyncTimes(),
        },
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[api] /api/bookings error:', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch bookings', detail: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json();
  const { guest, type, room, checkin, checkout, amount, notes } = body;

  if (!checkin || !checkout || checkin >= checkout) {
    return new Response(JSON.stringify({ error: 'Invalid check-in / check-out dates' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!['direct', 'friend', 'blocked'].includes(type)) {
    return new Response(JSON.stringify({ error: 'type must be direct, friend, or blocked' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!['nest', 'master', 'nomad', 'full'].includes(room)) {
    return new Response(JSON.stringify({ error: 'Invalid room' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
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
  return new Response(JSON.stringify(newBooking), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
