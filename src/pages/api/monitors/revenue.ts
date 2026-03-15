import type { APIRoute } from 'astro';
import { getMonthlyRevenueSummary } from '../../../lib/monitor-rentals.ts';
import { json, jsonError } from '../../../lib/api-response.ts';

export const GET: APIRoute = async () => {
  try {
    const summary = getMonthlyRevenueSummary();
    return json(summary);
  } catch (err: any) {
    console.error('[api] /api/monitors/revenue GET error:', err);
    return jsonError('Failed to get revenue summary', 500, err.message);
  }
};
