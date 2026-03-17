import type { APIRoute } from 'astro';
import { checkinPass, getRevenueSummary } from '../../../lib/coworking.ts';
import { json, jsonError } from '../../../lib/api-response.ts';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { passId } = body;
    if (!passId) return jsonError('passId is required');

    const pass = checkinPass(passId);
    const revenue = getRevenueSummary();
    return json({ pass, desksAvailable: revenue.desksAvailableToday });
  } catch (err: any) {
    console.error('[api] /api/coworking/checkin POST error:', err);
    const status = err.message.includes('not found') ? 404 : err.message.includes('not active') || err.message.includes('Already') ? 400 : 500;
    return jsonError(err.message, status);
  }
};
