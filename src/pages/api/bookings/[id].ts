import type { APIRoute } from 'astro';
import { readManualBookings, writeManualBookings, readPricing, writePricing } from '../../../lib/bookings.ts';

export const PATCH: APIRoute = async ({ params, request }) => {
  const { id } = params;
  const body = await request.json();
  const amount = parseFloat(body.amount);

  if (isNaN(amount) || amount < 0) {
    return new Response(JSON.stringify({ error: 'Invalid amount' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Check if it's a manual booking first
  const bookings = readManualBookings();
  const manual = bookings.find((b) => b.id === id);

  if (manual) {
    manual.amount = amount;
    writeManualBookings(bookings);
  } else {
    // iCal booking -- store in pricing.json
    const pricing = readPricing();
    pricing[id!] = amount;
    writePricing(pricing);
  }

  console.log(`[bookings] updated amount: ${id} = ${amount}`);
  return new Response(JSON.stringify({ updated: true, id, amount }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

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
