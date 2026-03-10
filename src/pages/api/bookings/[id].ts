import type { APIRoute } from 'astro';
import { readManualBookings, writeManualBookings, readOverrides, writeOverrides } from '../../../lib/bookings.ts';

const VALID_TYPES = ['direct', 'friend', 'blocked', 'owner', 'hold'];
const VALID_ROOMS = ['nest', 'master', 'nomad', 'theater', 'full'];

export const PATCH: APIRoute = async ({ params, request }) => {
  const { id } = params;
  const body = await request.json();
  const amount = body.amount !== undefined ? parseFloat(body.amount) : undefined;
  const guest = body.guest !== undefined ? String(body.guest).trim() : undefined;
  const checkin = body.checkin !== undefined ? String(body.checkin) : undefined;
  const checkout = body.checkout !== undefined ? String(body.checkout) : undefined;
  const type = body.type !== undefined ? String(body.type) : undefined;
  const room = body.room !== undefined ? String(body.room) : undefined;
  const notes = body.notes !== undefined ? String(body.notes) : undefined;

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
    // Manual bookings: all fields editable
    if (amount !== undefined) manual.amount = amount;
    if (guest !== undefined) manual.guest = guest;
    if (checkin !== undefined) manual.checkin = checkin;
    if (checkout !== undefined) manual.checkout = checkout;
    if (type !== undefined) {
      if (!VALID_TYPES.includes(type)) {
        return new Response(JSON.stringify({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      (manual as any).type = type;
    }
    if (room !== undefined) {
      if (!VALID_ROOMS.includes(room)) {
        return new Response(JSON.stringify({ error: `room must be one of: ${VALID_ROOMS.join(', ')}` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      manual.room = room;
    }
    if (notes !== undefined) manual.notes = notes;

    // Validate dates if both provided
    const finalCheckin = checkin || manual.checkin;
    const finalCheckout = checkout || manual.checkout;
    if (finalCheckin >= finalCheckout) {
      return new Response(JSON.stringify({ error: 'Check-in must be before check-out' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    writeManualBookings(bookings);
  } else {
    // iCal booking -- guest, amount, notes overrides
    const overrides = readOverrides();
    if (!overrides[id!]) overrides[id!] = {};
    if (amount !== undefined) overrides[id!].amount = amount;
    if (guest !== undefined) overrides[id!].guest = guest;
    if (notes !== undefined) overrides[id!].notes = notes;
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
