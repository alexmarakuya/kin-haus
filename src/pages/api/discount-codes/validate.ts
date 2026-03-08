import type { APIRoute } from 'astro';
import { readDiscountCodes } from '../../../lib/discount-codes.ts';

export const GET: APIRoute = async ({ url }) => {
  try {
    const code = (url.searchParams.get('code') || '').trim().toUpperCase();

    if (!code) {
      return new Response(JSON.stringify({ valid: false }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const codes = readDiscountCodes();
    const match = codes.find(c => c.code === code && c.active);

    if (match) {
      return new Response(JSON.stringify({ valid: true, discount: match.discount }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ valid: false }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[api] /api/discount-codes/validate error:', err);
    return new Response(JSON.stringify({ valid: false }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
