import type { APIRoute } from 'astro';
import { readManualBookings, writeManualBookings } from '../../../lib/bookings.ts';

export const DELETE: APIRoute = async ({ params }) => {
  const { id } = params;
  const bookings = readManualBookings();
  const index = bookings.findIndex((b) => b.id === id);

  if (index === -1) {
    return new Response(JSON.stringify({ error: 'Booking not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const removed = bookings.splice(index, 1)[0];
  writeManualBookings(bookings);

  console.log(`[bookings] deleted: ${id}`);
  return new Response(JSON.stringify({ deleted: true, booking: removed }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
