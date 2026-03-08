import type { APIRoute } from 'astro';
import { readInquiries, writeInquiries } from '../../../lib/inquiries.ts';

const ROOM_SLUGS: Record<string, string> = {
  'The Nest': 'nest',
  'Master Suite': 'master',
  'Nomad Room': 'nomad',
  'Theater Room': 'theater',
};

const ROOM_NAMES: Record<string, string> = {
  nest: 'The Nest',
  master: 'Master Suite',
  nomad: 'Nomad Room',
  theater: 'Theater Room',
};

export const GET: APIRoute = async () => {
  try {
    const inquiries = readInquiries();
    // Sort by createdAt descending (newest first)
    inquiries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return new Response(JSON.stringify({ inquiries }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[api] /api/inquiries GET error:', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch inquiries', detail: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { room, checkin, checkout, guest, message, whatsapp, amount, currency, promoCode, promoDiscount } = body;

    if (!room || !checkin || !checkout) {
      return new Response(JSON.stringify({ error: 'room, checkin, and checkout are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (checkin >= checkout) {
      return new Response(JSON.stringify({ error: 'checkout must be after checkin' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const roomSlug = ROOM_SLUGS[room] || room.toLowerCase().replace(/\s+/g, '-');
    const roomName = ROOM_NAMES[roomSlug] || room;
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
    return new Response(JSON.stringify(inquiry), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[api] /api/inquiries POST error:', err);
    return new Response(JSON.stringify({ error: 'Failed to create inquiry', detail: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
