import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_PRICING } from '../../lib/constants.ts';
import { json } from '../../lib/api-response.ts';

const PRICING_FILE = path.join(process.cwd(), 'data', 'pricing.json');

function readPricing() {
  try {
    if (!fs.existsSync(PRICING_FILE)) return { ...DEFAULT_PRICING };
    const raw = fs.readFileSync(PRICING_FILE, 'utf8');
    const data = JSON.parse(raw);
    return { ...DEFAULT_PRICING, ...data };
  } catch {
    return { ...DEFAULT_PRICING };
  }
}

function writePricing(pricing: Record<string, { high: number; low: number }>) {
  fs.writeFileSync(PRICING_FILE, JSON.stringify(pricing, null, 2), 'utf8');
}

export const GET: APIRoute = async () => {
  return json(readPricing());
};

export const PATCH: APIRoute = async ({ request }) => {
  const updates = await request.json();
  const current = readPricing();

  for (const room of Object.keys(updates)) {
    if (!current[room]) continue;
    if (typeof updates[room] !== 'object') continue;
    if (updates[room].high !== undefined) current[room].high = Number(updates[room].high) || 0;
    if (updates[room].low !== undefined) current[room].low = Number(updates[room].low) || 0;
  }

  writePricing(current);
  console.log('[pricing] updated:', JSON.stringify(current));
  return json(current);
};
