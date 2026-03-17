import type { APIRoute } from 'astro';
import { readPasses, writePasses, getRevenueSummary, calculateEndDate, DEFAULT_PRICING, TOTAL_DESKS } from '../../../lib/coworking.ts';
import { saveGuestProfile } from '../../../lib/guests.ts';
import { json, jsonError } from '../../../lib/api-response.ts';
import type { CoworkingPass } from '../../../lib/types.ts';

export const GET: APIRoute = async () => {
  try {
    const passes = readPasses();
    const revenue = getRevenueSummary();
    return json({ passes, today: { checkedIn: revenue.checkedInToday, desksAvailable: revenue.desksAvailableToday, totalDesks: TOTAL_DESKS }, revenue });
  } catch (err: any) {
    console.error('[api] /api/coworking GET error:', err);
    return jsonError('Failed to fetch passes', 500, err.message);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { name, type, amount, contact, guestId, startDate, notes } = body;

    if (!name?.trim()) return jsonError('Name is required');
    if (!type || !['day', 'weekly', 'monthly'].includes(type)) return jsonError('Invalid pass type');

    const start = startDate || new Date().toISOString().slice(0, 10);
    const endDate = calculateEndDate(start, type);
    const passAmount = amount || DEFAULT_PRICING[type as keyof typeof DEFAULT_PRICING];
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    const newPass: CoworkingPass = {
      id: `cwp-${Date.now()}`,
      guestId: guestId || undefined,
      name: name.trim(),
      contact: contact?.trim() || undefined,
      type,
      amount: passAmount,
      startDate: start,
      endDate,
      status: 'active',
      checkins: type === 'day' ? [start] : (start === today ? [today] : []),
      notes: notes?.trim() || '',
      createdAt: now,
      updatedAt: now,
    };

    const passes = readPasses();
    passes.push(newPass);
    writePasses(passes);

    // Auto-tag guest as coworking if linked
    if (guestId) {
      try {
        saveGuestProfile({ fullName: name.trim(), tags: ['coworking'] });
      } catch (err: any) {
        console.error('[coworking] guest tag error:', err.message);
      }
    }

    return json({ pass: newPass }, 201);
  } catch (err: any) {
    console.error('[api] /api/coworking POST error:', err);
    return jsonError('Failed to create pass', 500, err.message);
  }
};
