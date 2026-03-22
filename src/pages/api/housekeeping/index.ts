import type { APIRoute } from 'astro';
import { readHousekeeping, setHousekeepingStatus, getHousekeepingForMonth } from '../../../lib/housekeeping.ts';
import { json, jsonError } from '../../../lib/api-response.ts';
import { VALID_ROOMS } from '../../../lib/constants.ts';
import type { HousekeepingStatus } from '../../../lib/types.ts';

const VALID_STATUSES: HousekeepingStatus[] = ['needs_cleaning', 'in_progress', 'done'];

export const GET: APIRoute = async ({ url }) => {
  const month = url.searchParams.get('month');
  const data = month ? getHousekeepingForMonth(month) : readHousekeeping();
  return json({ housekeeping: data });
};

export const PATCH: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null);
  if (!body?.key || !body?.status) {
    return jsonError('Missing key or status');
  }

  const { key, status } = body as { key: string; status: string };

  // Validate key format: YYYY-MM-DD:room
  const match = key.match(/^(\d{4}-\d{2}-\d{2}):(\w+)$/);
  if (!match) return jsonError('Invalid key format. Expected YYYY-MM-DD:room');

  const room = match[2];
  if (!VALID_ROOMS.includes(room as any)) {
    return jsonError(`Invalid room: ${room}`);
  }

  if (!VALID_STATUSES.includes(status as HousekeepingStatus)) {
    return jsonError(`Invalid status. Use: ${VALID_STATUSES.join(', ')}`);
  }

  setHousekeepingStatus(key, status as HousekeepingStatus);
  return json({ ok: true, key, status });
};
