import type { APIRoute } from 'astro';
import { readHousekeepers, createHousekeeper } from '../../../lib/housekeepers.ts';
import { json, jsonError } from '../../../lib/api-response.ts';

export const GET: APIRoute = async () => {
  const housekeepers = readHousekeepers();
  return json({ housekeepers });
};

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null);
  if (!body?.name) return jsonError('Name is required');

  const hk = createHousekeeper({
    name: body.name,
    phone: body.phone,
    email: body.email,
    assignedRooms: body.assignedRooms,
    availableDays: body.availableDays,
    notes: body.notes,
  });

  return json({ housekeeper: hk }, 201);
};
