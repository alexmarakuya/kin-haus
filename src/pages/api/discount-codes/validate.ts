import type { APIRoute } from 'astro';
import { readDiscountCodes } from '../../../lib/discount-codes.ts';
import { json } from '../../../lib/api-response.ts';

export const GET: APIRoute = async ({ url }) => {
  try {
    const code = (url.searchParams.get('code') || '').trim().toUpperCase();

    if (!code) {
      return json({ valid: false });
    }

    const codes = readDiscountCodes();
    const match = codes.find(c => c.code === code && c.active);

    if (match) {
      return json({ valid: true, discount: match.discount });
    }

    return json({ valid: false });
  } catch (err: any) {
    console.error('[api] /api/discount-codes/validate error:', err);
    return json({ valid: false });
  }
};
