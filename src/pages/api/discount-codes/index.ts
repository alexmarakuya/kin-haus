import type { APIRoute } from 'astro';
import { readDiscountCodes, writeDiscountCodes } from '../../../lib/discount-codes.ts';
import { json, jsonError } from '../../../lib/api-response.ts';

const VALID_DISCOUNTS = [10, 20, 30, 40];

export const GET: APIRoute = async () => {
  try {
    const codes = readDiscountCodes();
    codes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json({ codes });
  } catch (err: any) {
    console.error('[api] /api/discount-codes GET error:', err);
    return jsonError('Failed to fetch codes', 500, err.message);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { code, discount, note } = body;

    if (!code || !discount) {
      return jsonError('code and discount are required');
    }

    const cleanCode = String(code).trim().toUpperCase();
    if (cleanCode.length < 3) {
      return jsonError('Code must be at least 3 characters');
    }

    const discountNum = parseInt(discount);
    if (!VALID_DISCOUNTS.includes(discountNum)) {
      return jsonError('Discount must be 10, 20, 30, or 40');
    }

    const codes = readDiscountCodes();

    if (codes.some(c => c.code === cleanCode)) {
      return jsonError('A code with that name already exists', 409);
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
    return json(newCode, 201);
  } catch (err: any) {
    console.error('[api] /api/discount-codes POST error:', err);
    return jsonError('Failed to create code', 500, err.message);
  }
};
