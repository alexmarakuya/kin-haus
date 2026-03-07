import type { APIRoute } from 'astro';
import { readManualBookings, writeManualBookings, readOverrides, writeOverrides } from '../../../lib/bookings.ts';

export const PATCH: APIRoute = async ({ params, request }) => {
  const { id } = params;
  const body = await request.json();
  const amount = body.amount !== undefined ? parseFloat(body.amount) : undefined;
  const guest = body.guest !== undefined ? String(body.guest).trim() : undefined;

  if (amount !== undefined && (isNaN(amount) || amount < 0)) {
    return new Response(JSON.stringify({ error: 'Invalid amount' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Check if it's a manual booking first
  const bookings = readManualBookings();
  const manual = bookings.find((b) => b.id === id);

  if (manual) {
    if (amount !== undefined) manual.amount = amount;
    if (guest !== undefined) manual.guest = guest;
    writeManualBookings(bookings);
  } else {
    // iCal booking -- store overrides in pricing.json
    const overrides = readOverrides();
    if (!overrides[id!]) overrides[id!] = {};
    if (amount !== undefined) overrides[id!].amount = amount;
    if (guest !== undefined) overrides[id!].guest = guest;
    writeOverrides(overrides);
  }

  console.log(`[bookings] updated: ${id} — amount=${amount}, guest=${guest}`);
  return new Response(JSON.stringify({ updated: true, id, amount, guest }), {
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
