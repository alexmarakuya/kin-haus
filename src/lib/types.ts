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
