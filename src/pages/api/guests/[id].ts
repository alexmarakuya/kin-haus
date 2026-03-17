import type { APIRoute } from 'astro';
import { readGuests, writeGuests } from '../../../lib/guests.ts';
import { json, jsonError } from '../../../lib/api-response.ts';

export const PATCH: APIRoute = async ({ params, request }) => {
  try {
    const guests = readGuests();
    const guest = guests.find(g => g.id === params.id);
    if (!guest) return jsonError('Guest not found', 404);

    const body = await request.json();

    // Identity
    if (body.fullName !== undefined) guest.fullName = body.fullName.trim();
    if (body.nationality !== undefined) guest.nationality = body.nationality.trim() || undefined;
    if (body.passportNumber !== undefined) guest.passportNumber = body.passportNumber.trim() || undefined;
    if (body.dateOfBirth !== undefined) guest.dateOfBirth = body.dateOfBirth.trim() || undefined;
    if (body.gender !== undefined) guest.gender = body.gender.trim() || undefined;

    // Contact
    if (body.email !== undefined) guest.email = body.email.trim() || undefined;
    if (body.phone !== undefined) guest.phone = body.phone.trim() || undefined;
    if (body.whatsapp !== undefined) guest.whatsapp = body.whatsapp.trim() || undefined;
    if (body.instagram !== undefined) guest.instagram = body.instagram.trim() || undefined;
    if (body.linkedin !== undefined) guest.linkedin = body.linkedin.trim() || undefined;
    if (body.website !== undefined) guest.website = body.website.trim() || undefined;

    // Preferences & notes
    if (body.preferredRoom !== undefined) guest.preferredRoom = body.preferredRoom.trim() || undefined;
    if (body.preferences !== undefined) guest.preferences = body.preferences.trim();
    if (body.notes !== undefined) guest.notes = body.notes.trim();
    if (body.source !== undefined) guest.source = body.source.trim() || undefined;

    // Tags (replace entirely)
    if (body.tags !== undefined) guest.tags = body.tags;

    // Booking links
    if (body.bookingIds !== undefined) guest.bookingIds = body.bookingIds;

    guest.updatedAt = new Date().toISOString();
    writeGuests(guests);
    return json({ guest });
  } catch (err: any) {
    console.error('[api] /api/guests PATCH error:', err);
    return jsonError('Failed to update guest', 500, err.message);
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const guests = readGuests();
    const idx = guests.findIndex(g => g.id === params.id);
    if (idx === -1) return jsonError('Guest not found', 404);

    guests.splice(idx, 1);
    writeGuests(guests);
    return json({ success: true });
  } catch (err: any) {
    console.error('[api] /api/guests DELETE error:', err);
    return jsonError('Failed to delete guest', 500, err.message);
  }
};
