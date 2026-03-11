import fs from 'node:fs';
import path from 'node:path';
import type { DiscountCode } from './types.ts';

const DATA_DIR = path.join(process.cwd(), 'data');
const CODES_FILE = path.join(DATA_DIR, 'discount-codes.json');

export function readDiscountCodes(): DiscountCode[] {
  try {
    if (!fs.existsSync(CODES_FILE)) return [];
    const raw = fs.readFileSync(CODES_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err: any) {
    console.error('[discount-codes] error reading file:', err.message);
    return [];
  }
}

export function writeDiscountCodes(codes: DiscountCode[]): void {
  fs.writeFileSync(CODES_FILE, JSON.stringify(codes, null, 2), 'utf8');
}
