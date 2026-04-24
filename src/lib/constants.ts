// Single source of truth for shared constants across the Kin Haus codebase.

export const VALID_BOOKING_TYPES = [
  "direct",
  "friend",
  "blocked",
  "owner",
  "hold",
  "waitlist",
] as const;
export type BookingType = (typeof VALID_BOOKING_TYPES)[number];

export const VALID_ROOMS = ["nest", "master", "nomad", "theater", "full"] as const;
export type RoomSlug = (typeof VALID_ROOMS)[number];

export const ROOM_LABELS: Record<string, string> = {
  nest: "The Nest",
  master: "The Explorer",
  nomad: "The Nomad",
  theater: "Theater Room",
};

// Reverse lookup: display name -> slug
export const ROOM_SLUGS: Record<string, string> = Object.fromEntries(
  Object.entries(ROOM_LABELS).map(([slug, label]) => [label, slug]),
);

export const DEFAULT_PRICING: Record<string, { high: number; low: number }> = {
  nest: { high: 5000, low: 3500 },
  master: { high: 3200, low: 2240 },
  nomad: { high: 2400, low: 1680 },
};

export const VALID_INQUIRY_STATUSES = ["new", "responded", "booked", "archived"] as const;
export type InquiryStatus = (typeof VALID_INQUIRY_STATUSES)[number];

/** Booking types where payment is implicit (no cash changes hands).
 *  These get paymentStatus = 'paid' as a smart default.
 *  Keep in sync with the inline JS in dashboard.astro. */
export const NO_PAYMENT_TYPES = ["blocked", "owner", "hold", "friend"] as const;

/** Booking types exempt from TM30 immigration reporting.
 *  These get tm30Status = 'not_required' as a smart default.
 *  Keep in sync with the inline JS in dashboard.astro. */
export const NO_TM30_TYPES = ["blocked", "owner", "hold"] as const;

export const VALID_EXPENSE_CATEGORIES = [
  "supplies",
  "food",
  "utilities",
  "maintenance",
  "travel",
  "fees",
  "other",
] as const;
export type ExpenseCategorySlug = (typeof VALID_EXPENSE_CATEGORIES)[number];

/** Kin Haus P&L vs personal money (default for expenses: business). */
export const VALID_ACCOUNTING_SCOPES = ["business", "personal"] as const;
export type AccountingScopeSlug = (typeof VALID_ACCOUNTING_SCOPES)[number];

/** Where income landed (Airbnb payouts often hit Wise). */
export const VALID_INCOME_DEPOSIT_ACCOUNTS = [
  "wise",
  "cash",
  "business",
  "personal_other",
  "other",
] as const;
export type IncomeDepositAccountSlug = (typeof VALID_INCOME_DEPOSIT_ACCOUNTS)[number];

export const VALID_INCOME_CATEGORIES = [
  "airbnb",
  "direct_booking",
  "coworking",
  "monitor_rental",
  "transfer",
  "other",
] as const;
export type IncomeCategorySlug = (typeof VALID_INCOME_CATEGORIES)[number];
