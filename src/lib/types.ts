import type { RoomKey } from './config.ts';

export interface Booking {
  id: string;
  guest: string;
  type: 'airbnb' | 'direct' | 'friend' | 'blocked' | 'owner' | 'hold' | 'waitlist';
  room: string;
  checkin: string;
  checkout: string;
  amount: number;
  notes: string;
  source?: 'ical' | 'manual';
  conflict?: boolean;
  conflictWith?: string | null;
}

export interface BookingOverrides {
  [id: string]: { amount?: number; guest?: string; notes?: string };
}

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
  promoCode?: string;
  promoDiscount?: number;
  status: 'new' | 'responded' | 'booked' | 'archived';
  createdAt: string;
}

export interface DiscountCode {
  id: string;
  code: string;
  discount: number;
  note: string;
  active: boolean;
  createdAt: string;
}

export interface AvailableWindow {
  start: string;
  end: string;
  nights: number;
}

export interface RoomAvailability {
  room: RoomKey;
  isAvailableNow: boolean;
  currentBookingEnd: string | null;
  nextAvailable: AvailableWindow | null;
  allWindows: AvailableWindow[];
}

export interface GuestProfile {
  id: string;
  fullName: string;
  nationality?: string;
  passportNumber?: string;
  dateOfBirth?: string;
  gender?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  instagram?: string;           // Instagram handle or URL
  linkedin?: string;            // LinkedIn URL
  website?: string;             // Personal website URL
  tags: string[];               // e.g. "returning", "vip", "long-stay", "referred"
  preferredRoom?: string;       // room slug they prefer
  preferences: string;          // free-text: dietary, habits, special requests
  notes: string;                // internal operator notes
  bookingIds: string[];
  totalStays: number;
  totalRevenue: number;
  firstStay?: string;           // ISO date of first check-in
  lastStay?: string;            // ISO date of most recent check-in
  source?: string;              // how they found us: "airbnb", "direct", "referral", "repeat"
  createdAt: string;
  updatedAt: string;
}

export interface CoworkingPass {
  id: string;
  guestId?: string;
  name: string;
  contact?: string;
  type: 'day' | 'weekly' | 'monthly';
  amount: number;
  startDate: string;
  endDate: string;
  status: 'active' | 'expired' | 'cancelled';
  checkins: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Housekeeping ────────────────────────────────────────────────────────────
export type HousekeepingStatus = 'pending' | 'in_progress' | 'done';
export type HousekeepingTaskType = 'cleaning' | 'maintenance' | 'laundry' | 'inspection' | 'other';

export interface HousekeepingTask {
  id: string;
  date: string;            // YYYY-MM-DD
  room: string;            // room slug or "common"
  type: HousekeepingTaskType;
  title: string;
  status: HousekeepingStatus;
  assigneeId?: string;     // housekeeper ID
  notes?: string;
  auto?: boolean;          // true if auto-generated from turnover
  createdAt: string;
}

export type StaffRole = 'housekeeper' | 'maintenance' | 'pool' | 'pest_control' | 'gardener' | 'other';

export interface Housekeeper {
  id: string;
  name: string;
  role: StaffRole;           // staff role (default: housekeeper)
  phone?: string;
  lineId?: string;           // LINE app ID
  messenger?: string;        // Facebook Messenger name/link
  email?: string;
  assignedRooms: string[];
  availableDays: number[];   // 0=Sun, 1=Mon, ..., 6=Sat
  token: string;             // unique token for iCal feed URL
  active: boolean;
  notes?: string;
  rate?: string;             // e.g. "500/day", "200/visit"
  createdAt: string;
}

export interface Monitor {
  id: string;
  name: string;
  status: 'available' | 'rented' | 'maintenance';
  dailyRate: number;
  notes: string;
}

export interface MonitorRental {
  id: string;
  monitorId: string;
  renter: string;
  contact: string;
  startDate: string;
  deliveryDate?: string;
  endDate: string;
  dailyRate: number;
  depositHeld: boolean;
  revenue: number;
  status: 'booked' | 'delivered' | 'completed' | 'cancelled';
  notes: string;
  createdAt: string;
  completedAt?: string;
}
