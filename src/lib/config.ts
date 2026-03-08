import fs from 'node:fs';
import path from 'node:path';

export const ROOMS = ['nest', 'master', 'nomad'] as const;
export type RoomKey = (typeof ROOMS)[number];

export interface RoomConfig {
  room: RoomKey;
  label: string;
  url: string;
  rate: number;
}

const DEFAULT_RATES: Record<RoomKey, number> = { nest: 5000, master: 3200, nomad: 2400 };

function readRates(): Record<RoomKey, number> {
  try {
    const pricingPath = path.join(process.cwd(), 'data', 'pricing.json');
    if (fs.existsSync(pricingPath)) {
      const data = JSON.parse(fs.readFileSync(pricingPath, 'utf8'));
      return {
        nest: data.nest?.high ?? DEFAULT_RATES.nest,
        master: data.master?.high ?? DEFAULT_RATES.master,
        nomad: data.nomad?.high ?? DEFAULT_RATES.nomad,
      };
    }
  } catch { /* fallback to defaults */ }
  return { ...DEFAULT_RATES };
}

const rates = readRates();

export const ICAL_SOURCES: Record<RoomKey, RoomConfig> = {
  nest: {
    room: 'nest',
    label: 'The Nest',
    url: import.meta.env.ICAL_URL_NEST,
    rate: rates.nest,
  },
  master: {
    room: 'master',
    label: 'Master Room',
    url: import.meta.env.ICAL_URL_MASTER,
    rate: rates.master,
  },
  nomad: {
    room: 'nomad',
    label: 'Nomad Room',
    url: import.meta.env.ICAL_URL_NOMAD,
    rate: rates.nomad,
  },
};

export const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
