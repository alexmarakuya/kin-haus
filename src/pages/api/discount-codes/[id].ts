import type { APIRoute } from 'astro';
import { readDiscountCodes, writeDiscountCodes } from '../../../lib/discount-codes.ts';

export const PATCH: APIRoute = async ({ params, request }) => {
  try {
    const { id } = params;
    const body = await request.json();
    const codes = readDiscountCodes();
    const idx = codes.findIndex(c => c.id === id);

    if (idx === -1) {
      return new Response(JSON.stringify({ error: 'Code not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (typeof body.active === 'boolean') {
      codes[idx].active = body.active;
    }

    writeDiscountCodes(codes);
    console.log(`[discount-codes] updated: ${codes[idx].code} (active: ${codes[idx].active})`);
    return new Response(JSON.stringify(codes[idx]), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[api] /api/discount-codes PATCH error:', err);
    return new Response(JSON.stringify({ error: 'Failed to update code', detail: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const { id } = params;
    const codes = readDiscountCodes();
    const idx = codes.findIndex(c => c.id === id);

    if (idx === -1) {
      return new Response(JSON.stringify({ error: 'Code not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const removed = codes.splice(idx, 1)[0];
    writeDiscountCodes(codes);
    console.log(`[discount-codes] deleted: ${removed.code}`);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[api] /api/discount-codes DELETE error:', err);
    return new Response(JSON.stringify({ error: 'Failed to delete code', detail: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
