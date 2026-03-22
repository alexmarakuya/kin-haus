import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Housekeeper } from './types.ts';

const DATA_DIR = path.join(process.cwd(), 'data');
const HK_FILE = path.join(DATA_DIR, 'housekeepers.json');

export function readHousekeepers(): Housekeeper[] {
  try {
    if (!fs.existsSync(HK_FILE)) return [];
    const raw = fs.readFileSync(HK_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err: any) {
    console.error('[housekeepers] error reading file:', err.message);
    return [];
  }
}

export function writeHousekeepers(list: Housekeeper[]): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(HK_FILE, JSON.stringify(list, null, 2), 'utf8');
}

export function findHousekeeperByToken(token: string): Housekeeper | undefined {
  return readHousekeepers().find(h => h.token === token && h.active);
}

export function createHousekeeper(data: {
  name: string;
  phone?: string;
  email?: string;
  assignedRooms?: string[];
  availableDays?: number[];
  notes?: string;
}): Housekeeper {
  const list = readHousekeepers();
  const hk: Housekeeper = {
    id: crypto.randomUUID(),
    name: data.name,
    phone: data.phone,
    email: data.email,
    assignedRooms: data.assignedRooms || [],
    availableDays: data.availableDays || [0, 1, 2, 3, 4, 5, 6],
    token: crypto.randomBytes(16).toString('hex'),
    active: true,
    notes: data.notes,
    createdAt: new Date().toISOString(),
  };
  list.push(hk);
  writeHousekeepers(list);
  return hk;
}

export function updateHousekeeper(id: string, updates: Partial<Omit<Housekeeper, 'id' | 'token' | 'createdAt'>>): Housekeeper | null {
  const list = readHousekeepers();
  const idx = list.findIndex(h => h.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...updates };
  writeHousekeepers(list);
  return list[idx];
}

export function deleteHousekeeper(id: string): boolean {
  const list = readHousekeepers();
  const idx = list.findIndex(h => h.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  writeHousekeepers(list);
  return true;
}
