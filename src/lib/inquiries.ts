import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');
const INQUIRIES_FILE = path.join(DATA_DIR, 'inquiries.json');

export interface Inquiry {
  id: string;
  room: string;
  roomSlug: string;
  checkin: string;
  checkout: string;
  nights: number;
  guest: string;
  message: string;
  whatsapp: string;
  amount: number;
  currency: string;
  status: 'new' | 'responded' | 'booked' | 'archived';
  createdAt: string;
}

export function readInquiries(): Inquiry[] {
  try {
    if (!fs.existsSync(INQUIRIES_FILE)) return [];
    const raw = fs.readFileSync(INQUIRIES_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err: any) {
    console.error('[inquiries] error reading file:', err.message);
    return [];
  }
}

export function writeInquiries(inquiries: Inquiry[]): void {
  fs.writeFileSync(INQUIRIES_FILE, JSON.stringify(inquiries, null, 2), 'utf8');
}
