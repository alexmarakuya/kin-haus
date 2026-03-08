import type { APIRoute } from 'astro';
import { readDiscountCodes, writeDiscountCodes } from '../../../lib/discount-codes.ts';

const VALID_DISCOUNTS = [10, 20, 30, 40];

export const GET: APIRoute = async () => {
  try {
    const codes = readDiscountCodes();
    codes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return new Response(JSON.stringify({ codes }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[api] /api/discount-codes GET error:', err);
    return new Response(JSON.stringify({ error: 'Failed to fetch codes', detail: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { code, discount, note } = body;

    if (!code || !discount) {
      return new Response(JSON.stringify({ error: 'code and discount are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const cleanCode = String(code).trim().toUpperCase();
    if (cleanCode.length < 3) {
      return new Response(JSON.stringify({ error: 'Code must be at least 3 characters' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const discountNum = parseInt(discount);
    if (!VALID_DISCOUNTS.includes(discountNum)) {
      return new Response(JSON.stringify({ error: 'Discount must be 10, 20, 30, or 40' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const codes = readDiscountCodes();

    if (codes.some(c => c.code === cleanCode)) {
      return new Response(JSON.stringify({ error: 'A code with that name already exists' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const newCode = {
      id: `dc-${Date.now()}`,
      code: cleanCode,
      discount: discountNum,
      note: note || '',
      active: true,
      createdAt: new Date().toISOString(),
    };

    codes.push(newCode);
    writeDiscountCodes(codes);

    console.log(`[discount-codes] created: ${newCode.code} (${newCode.discount}%)`);
    return new Response(JSON.stringify(newCode), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('[api] /api/discount-codes POST error:', err);
    return new Response(JSON.stringify({ error: 'Failed to create code', detail: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
