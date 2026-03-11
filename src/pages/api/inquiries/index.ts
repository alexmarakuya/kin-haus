import type { APIRoute } from 'astro';
import { readInquiries, writeInquiries } from '../../../lib/inquiries.ts';
import { ROOM_SLUGS, ROOM_LABELS } from '../../../lib/constants.ts';
import { json, jsonError } from '../../../lib/api-response.ts';

export const GET: APIRoute = async () => {
  try {
    const inquiries = readInquiries();
    // Sort by createdAt descending (newest first)
    inquiries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json({ inquiries });
  } catch (err: any) {
    console.error('[api] /api/inquiries GET error:', err);
    return jsonError('Failed to fetch inquiries', 500, err.message);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { room, checkin, checkout, guest, message, whatsapp, amount, currency, promoCode, promoDiscount } = body;

    if (!room || !checkin || !checkout) {
      return jsonError('room, checkin, and checkout are required');
    }

    if (checkin >= checkout) {
      return jsonError('checkout must be after checkin');
    }

    const roomSlug = ROOM_SLUGS[room] || room.toLowerCase().replace(/\s+/g, '-');
    const roomName = ROOM_LABELS[roomSlug] || room;
    const nights = Math.round((new Date(checkout + 'T12:00:00').getTime() - new Date(checkin + 'T12:00:00').getTime()) / 86400000);

    const inquiry = {
      id: `inq-${Date.now()}`,
      room: roomName,
      roomSlug,
      checkin,
      checkout,
      nights,
      guest: guest || 'Guest',
      message: message || '',
      whatsapp: whatsapp || '',
      amount: parseFloat(amount) || 0,
      currency: currency || 'thb',
      promoCode: promoCode || '',
      promoDiscount: parseInt(promoDiscount) || 0,
      status: 'new' as const,
      createdAt: new Date().toISOString(),
    };

    const inquiries = readInquiries();
    inquiries.push(inquiry);
    writeInquiries(inquiries);

    console.log(`[inquiries] new: ${inquiry.id} -- ${inquiry.guest} (${inquiry.room}, ${inquiry.checkin} to ${inquiry.checkout})`);
    return json(inquiry, 201);
  } catch (err: any) {
    console.error('[api] /api/inquiries POST error:', err);
    return jsonError('Failed to create inquiry', 500, err.message);
  }
};
