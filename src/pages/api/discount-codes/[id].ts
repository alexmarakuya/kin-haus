import type { APIRoute } from 'astro';
import { readDiscountCodes, writeDiscountCodes } from '../../../lib/discount-codes.ts';
import { json, jsonError } from '../../../lib/api-response.ts';

export const PATCH: APIRoute = async ({ params, request }) => {
  try {
    const { id } = params;
    const body = await request.json();
    const codes = readDiscountCodes();
    const idx = codes.findIndex(c => c.id === id);

    if (idx === -1) {
      return jsonError('Code not found', 404);
    }

    if (typeof body.active === 'boolean') {
      codes[idx].active = body.active;
    }

    writeDiscountCodes(codes);
    console.log(`[discount-codes] updated: ${codes[idx].code} (active: ${codes[idx].active})`);
    return json(codes[idx]);
  } catch (err: any) {
    console.error('[api] /api/discount-codes PATCH error:', err);
    return jsonError('Failed to update code', 500, err.message);
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const { id } = params;
    const codes = readDiscountCodes();
    const idx = codes.findIndex(c => c.id === id);

    if (idx === -1) {
      return jsonError('Code not found', 404);
    }

    const removed = codes.splice(idx, 1)[0];
    writeDiscountCodes(codes);
    console.log(`[discount-codes] deleted: ${removed.code}`);
    return json({ ok: true });
  } catch (err: any) {
    console.error('[api] /api/discount-codes DELETE error:', err);
    return jsonError('Failed to delete code', 500, err.message);
  }
};
