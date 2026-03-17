import type { APIRoute } from 'astro';
import { readGuests, saveGuestProfile } from '../../../lib/guests.ts';
import { json, jsonError } from '../../../lib/api-response.ts';

export const GET: APIRoute = async () => {
  try {
    const guests = readGuests();
    guests.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return json({ guests });
  } catch (err: any) {
    console.error('[api] /api/guests GET error:', err);
    return jsonError('Failed to fetch guests', 500, err.message);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { fullName, nationality, passportNumber, dateOfBirth, gender, email, phone, whatsapp, tags, preferredRoom, preferences, notes, source } = body;

    if (!fullName || !fullName.trim()) {
      return jsonError('fullName is required');
    }

    const guest = saveGuestProfile({
      fullName: fullName.trim(),
      nationality: nationality?.trim(),
      passportNumber: passportNumber?.trim(),
      dateOfBirth: dateOfBirth?.trim(),
      gender: gender?.trim(),
      email: email?.trim(),
      phone: phone?.trim(),
      whatsapp: whatsapp?.trim(),
      tags: tags || [],
      preferredRoom: preferredRoom?.trim(),
      preferences: preferences?.trim() || '',
      notes: notes?.trim() || '',
      source: source?.trim(),
    });

    return json({ guest }, 201);
  } catch (err: any) {
    console.error('[api] /api/guests POST error:', err);
    return jsonError('Failed to create guest', 500, err.message);
  }
};
