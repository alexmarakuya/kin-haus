// Single source of truth for shared constants across the Kin Haus codebase.

export const VALID_BOOKING_TYPES = ['direct', 'friend', 'blocked', 'owner', 'hold', 'waitlist'] as const;
export type BookingType = (typeof VALID_BOOKING_TYPES)[number];

export const VALID_ROOMS = ['nest', 'master', 'nomad', 'theater', 'full'] as const;
export type RoomSlug = (typeof VALID_ROOMS)[number];

export const ROOM_LABELS: Record<string, string> = {
  nest: 'The Nest',
  master: 'The Explorer',
  nomad: 'Nomad Room',
  theater: 'Theater Room',
};

// Reverse lookup: display name -> slug
export const ROOM_SLUGS: Record<string, string> = Object.fromEntries(
  Object.entries(ROOM_LABELS).map(([slug, label]) => [label, slug])
);

export const DEFAULT_PRICING: Record<string, { high: number; low: number }> = {
  nest:   { high: 5000, low: 3500 },
  master: { high: 3200, low: 2240 },
  nomad:  { high: 2400, low: 1680 },
};

export const VALID_INQUIRY_STATUSES = ['new', 'responded', 'booked', 'archived'] as const;
export type InquiryStatus = (typeof VALID_INQUIRY_STATUSES)[number];
