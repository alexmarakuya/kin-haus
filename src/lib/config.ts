export const ROOMS = ['nest', 'master', 'nomad'] as const;
export type RoomKey = (typeof ROOMS)[number];

export interface RoomConfig {
  room: RoomKey;
  label: string;
  url: string;
  rate: number;
}

export const ICAL_SOURCES: Record<RoomKey, RoomConfig> = {
  nest: {
    room: 'nest',
    label: 'The Nest',
    url: import.meta.env.ICAL_URL_NEST,
    rate: 5000,
  },
  master: {
    room: 'master',
    label: 'Master Suite',
    url: import.meta.env.ICAL_URL_MASTER,
    rate: 3200,
  },
  nomad: {
    room: 'nomad',
    label: 'Nomad Room',
    url: import.meta.env.ICAL_URL_NOMAD,
    rate: 2400,
  },
};

export const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
