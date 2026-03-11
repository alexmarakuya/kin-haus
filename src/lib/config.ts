import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_PRICING, ROOM_LABELS } from './constants.ts';

export const ROOMS = ['nest', 'master', 'nomad'] as const;
export type RoomKey = (typeof ROOMS)[number];

export interface RoomConfig {
  room: RoomKey;
  label: string;
  url: string;
  rate: number;
}

function readRates(): Record<RoomKey, number> {
  try {
    const pricingPath = path.join(process.cwd(), 'data', 'pricing.json');
    if (fs.existsSync(pricingPath)) {
      const data = JSON.parse(fs.readFileSync(pricingPath, 'utf8'));
      return {
        nest: data.nest?.high ?? DEFAULT_PRICING.nest.high,
        master: data.master?.high ?? DEFAULT_PRICING.master.high,
        nomad: data.nomad?.high ?? DEFAULT_PRICING.nomad.high,
      };
    }
  } catch { /* fallback to defaults */ }
  return { nest: DEFAULT_PRICING.nest.high, master: DEFAULT_PRICING.master.high, nomad: DEFAULT_PRICING.nomad.high };
}

const rates = readRates();

export const ICAL_SOURCES: Record<RoomKey, RoomConfig> = {
  nest: {
    room: 'nest',
    label: ROOM_LABELS.nest,
    url: import.meta.env.ICAL_URL_NEST,
    rate: rates.nest,
  },
  master: {
    room: 'master',
    label: ROOM_LABELS.master,
    url: import.meta.env.ICAL_URL_MASTER,
    rate: rates.master,
  },
  nomad: {
    room: 'nomad',
    label: ROOM_LABELS.nomad,
    url: import.meta.env.ICAL_URL_NOMAD,
    rate: rates.nomad,
  },
};

export const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
