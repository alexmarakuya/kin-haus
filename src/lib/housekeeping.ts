import fs from 'node:fs';
import path from 'node:path';
import type { HousekeepingMap, HousekeepingStatus } from './types.ts';

const DATA_DIR = path.join(process.cwd(), 'data');
const HK_FILE = path.join(DATA_DIR, 'housekeeping.json');

export function readHousekeeping(): HousekeepingMap {
  try {
    if (!fs.existsSync(HK_FILE)) return {};
    const raw = fs.readFileSync(HK_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err: any) {
    console.error('[housekeeping] error reading file:', err.message);
    return {};
  }
}

export function writeHousekeeping(data: HousekeepingMap): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(HK_FILE, JSON.stringify(data, null, 2), 'utf8');
}

export function setHousekeepingStatus(key: string, status: HousekeepingStatus): void {
  const data = readHousekeeping();
  data[key] = status;
  writeHousekeeping(data);
}

export function getHousekeepingForMonth(month: string): HousekeepingMap {
  const all = readHousekeeping();
  const filtered: HousekeepingMap = {};
  for (const [key, status] of Object.entries(all)) {
    if (key.startsWith(month)) filtered[key] = status;
  }
  return filtered;
}
