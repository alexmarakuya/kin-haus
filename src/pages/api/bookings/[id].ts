import type { APIRoute } from 'astro';
import { readManualBookings, writeManualBookings, readOverrides, writeOverrides } from '../../../lib/bookings.ts';
import { VALID_BOOKING_TYPES, VALID_ROOMS } from '../../../lib/constants.ts';
import { json, jsonError } from '../../../lib/api-response.ts';
import { saveGuestProfile, syncGuestStats } from '../../../lib/guests.ts';

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
  const paymentStatus = body.paymentStatus !== undefined ? String(body.paymentStatus) : undefined;
  const tm30Status = body.tm30Status !== undefined ? String(body.tm30Status) : undefined;

  if (amount !== undefined && (isNaN(amount) || amount < 0)) {
    return jsonError('Invalid amount');
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
      if (!VALID_BOOKING_TYPES.includes(type)) {
        return jsonError(`type must be one of: ${VALID_BOOKING_TYPES.join(', ')}`);
      }
      (manual as any).type = type;
    }
    if (room !== undefined) {
      if (!VALID_ROOMS.includes(room)) {
        return jsonError(`room must be one of: ${VALID_ROOMS.join(', ')}`);
      }
      manual.room = room;
    }
    if (notes !== undefined) manual.notes = notes;
    if (paymentStatus !== undefined) (manual as any).paymentStatus = paymentStatus;
    if (tm30Status !== undefined) (manual as any).tm30Status = tm30Status;

    // Validate dates if both provided
    const finalCheckin = checkin || manual.checkin;
    const finalCheckout = checkout || manual.checkout;
    if (finalCheckin >= finalCheckout) {
      return jsonError('Check-in must be before check-out');
    }

    writeManualBookings(bookings);
  } else {
    // iCal booking -- guest, amount, notes overrides
    const overrides = readOverrides();
    if (!overrides[id!]) overrides[id!] = {};
    if (amount !== undefined) overrides[id!].amount = amount;
    if (guest !== undefined) overrides[id!].guest = guest;
    if (notes !== undefined) overrides[id!].notes = notes;
    if (paymentStatus !== undefined) (overrides[id!] as any).paymentStatus = paymentStatus;
    if (tm30Status !== undefined) (overrides[id!] as any).tm30Status = tm30Status;
    writeOverrides(overrides);
  }

  // Auto-create or update guest profile when guest name is set
  const skipNames = ['guest', 'blocked', 'owner', 'hold', ''];
  const guestName = guest || (manual ? manual.guest : undefined);
  if (guestName && !skipNames.includes(guestName.toLowerCase()) && !guestName.startsWith('Guest ···')) {
    try {
      const guestProfile = saveGuestProfile({
        fullName: guestName,
        bookingIds: [id!],
        preferredRoom: room || (manual ? manual.room : undefined),
        source: manual ? (manual.type === 'direct' ? 'direct' : manual.type) : 'airbnb',
      });
      const allBookings = readManualBookings();
      syncGuestStats(guestProfile.id, allBookings);
      console.log(`[guests] auto-linked booking ${id} to guest profile ${guestProfile.id} (${guestProfile.fullName})`);
    } catch (err: any) {
      console.error('[guests] auto-link error:', err.message);
    }
  }

  console.log(`[bookings] updated: ${id} — amount=${amount}, guest=${guest}`);
  return json({ updated: true, id, amount, guest });
};

export const DELETE: APIRoute = async ({ params }) => {
  const { id } = params;
  const bookings = readManualBookings();
  const index = bookings.findIndex((b) => b.id === id);

  if (index === -1) {
    return jsonError('Booking not found', 404);
  }

  const removed = bookings.splice(index, 1)[0];
  writeManualBookings(bookings);

  console.log(`[bookings] deleted: ${id}`);
  return json({ deleted: true, booking: removed });
};
