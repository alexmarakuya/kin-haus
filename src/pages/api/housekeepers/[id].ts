import type { APIRoute } from 'astro';
import { updateHousekeeper, deleteHousekeeper } from '../../../lib/housekeepers.ts';
import { json, jsonError } from '../../../lib/api-response.ts';

export const PATCH: APIRoute = async ({ params, request }) => {
  const { id } = params;
  if (!id) return jsonError('Missing housekeeper ID');

  const body = await request.json().catch(() => null);
  if (!body) return jsonError('Invalid JSON body');

  const hk = updateHousekeeper(id, body);
  if (!hk) return jsonError('Housekeeper not found', 404);

  return json({ housekeeper: hk });
};

export const DELETE: APIRoute = async ({ params }) => {
  const { id } = params;
  if (!id) return jsonError('Missing housekeeper ID');

  const deleted = deleteHousekeeper(id);
  if (!deleted) return jsonError('Housekeeper not found', 404);

  return json({ ok: true });
};
