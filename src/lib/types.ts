export interface Booking {
  id: string;
  guest: string;
  type: 'airbnb' | 'direct' | 'friend' | 'blocked' | 'hold';
  room: string;
  checkin: string;
  checkout: string;
  amount: number;
  notes: string;
  source?: 'ical' | 'manual';
  conflict?: boolean;
  conflictWith?: string | null;
}
