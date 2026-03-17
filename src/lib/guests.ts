import fs from 'node:fs';
import path from 'node:path';
import type { GuestProfile } from './types.ts';

const DATA_DIR = path.join(process.cwd(), 'data');
const GUESTS_FILE = path.join(DATA_DIR, 'guests.json');

export function readGuests(): GuestProfile[] {
  try {
    if (!fs.existsSync(GUESTS_FILE)) return [];
    const raw = fs.readFileSync(GUESTS_FILE, 'utf8');
    const guests = JSON.parse(raw) as GuestProfile[];
    // Migrate old profiles that lack new fields
    return guests.map(g => ({
      ...g,
      tags: g.tags || [],
      preferences: g.preferences || '',
      notes: g.notes || '',
      totalStays: g.totalStays || 0,
      totalRevenue: g.totalRevenue || 0,
    }));
  } catch (err: any) {
    console.error('[guests] error reading file:', err.message);
    return [];
  }
}

export function writeGuests(guests: GuestProfile[]): void {
  fs.writeFileSync(GUESTS_FILE, JSON.stringify(guests, null, 2), 'utf8');
}

export function findGuestByName(name: string): GuestProfile | undefined {
  const guests = readGuests();
  const lower = name.toLowerCase().trim();
  return guests.find(g => g.fullName.toLowerCase() === lower)
    || guests.find(g => g.fullName.toLowerCase().includes(lower) || lower.includes(g.fullName.toLowerCase()));
}

export function findGuestByPassport(passportNumber: string): GuestProfile | undefined {
  const guests = readGuests();
  return guests.find(g => g.passportNumber === passportNumber);
}

export function saveGuestProfile(profile: Partial<GuestProfile> & { fullName: string }): GuestProfile {
  const guests = readGuests();
  const now = new Date().toISOString();

  // Try to find existing guest by passport number or name
  let existing: GuestProfile | undefined;
  if (profile.passportNumber) {
    existing = guests.find(g => g.passportNumber === profile.passportNumber);
  }
  if (!existing) {
    existing = findGuestByName(profile.fullName);
  }

  if (existing) {
    // Merge new data into existing profile (only override non-empty values)
    if (profile.fullName) existing.fullName = profile.fullName;
    if (profile.nationality) existing.nationality = profile.nationality;
    if (profile.passportNumber) existing.passportNumber = profile.passportNumber;
    if (profile.dateOfBirth) existing.dateOfBirth = profile.dateOfBirth;
    if (profile.gender) existing.gender = profile.gender;
    if (profile.email) existing.email = profile.email;
    if (profile.phone) existing.phone = profile.phone;
    if (profile.whatsapp) existing.whatsapp = profile.whatsapp;
    if (profile.preferredRoom) existing.preferredRoom = profile.preferredRoom;
    if (profile.preferences) existing.preferences = existing.preferences ? `${existing.preferences}\n${profile.preferences}` : profile.preferences;
    if (profile.notes) existing.notes = existing.notes ? `${existing.notes}\n${profile.notes}` : profile.notes;
    if (profile.source && !existing.source) existing.source = profile.source;
    if (profile.tags && profile.tags.length) {
      const tagSet = new Set([...existing.tags, ...profile.tags]);
      existing.tags = [...tagSet];
    }
    if (profile.bookingIds && profile.bookingIds.length) {
      const ids = new Set([...existing.bookingIds, ...profile.bookingIds]);
      existing.bookingIds = [...ids];
    }
    existing.updatedAt = now;
    writeGuests(guests);
    return existing;
  }

  // Create new guest
  const newGuest: GuestProfile = {
    id: `guest-${Date.now()}`,
    fullName: profile.fullName,
    nationality: profile.nationality,
    passportNumber: profile.passportNumber,
    dateOfBirth: profile.dateOfBirth,
    gender: profile.gender,
    email: profile.email,
    phone: profile.phone,
    whatsapp: profile.whatsapp,
    tags: profile.tags || [],
    preferredRoom: profile.preferredRoom,
    preferences: profile.preferences || '',
    notes: profile.notes || '',
    bookingIds: profile.bookingIds || [],
    totalStays: profile.totalStays || 0,
    totalRevenue: profile.totalRevenue || 0,
    source: profile.source,
    createdAt: now,
    updatedAt: now,
  };
  guests.push(newGuest);
  writeGuests(guests);
  return newGuest;
}

/**
 * Recalculate totalStays, totalRevenue, firstStay, lastStay from linked bookings
 */
export function syncGuestStats(guestId: string, bookings: { id: string; checkin: string; checkout: string; amount: number; type: string }[]): void {
  const guests = readGuests();
  const guest = guests.find(g => g.id === guestId);
  if (!guest) return;

  const linked = bookings.filter(b => guest.bookingIds.includes(b.id));
  const revenueBookings = linked.filter(b => b.type === 'airbnb' || b.type === 'direct');

  guest.totalStays = linked.length;
  guest.totalRevenue = revenueBookings.reduce((sum, b) => sum + (b.amount || 0), 0);

  if (linked.length) {
    const sorted = [...linked].sort((a, b) => a.checkin.localeCompare(b.checkin));
    guest.firstStay = sorted[0].checkin;
    guest.lastStay = sorted[sorted.length - 1].checkin;
  }

  // Auto-tag returning guests
  if (guest.totalStays >= 2 && !guest.tags.includes('returning')) {
    guest.tags.push('returning');
  }

  guest.updatedAt = new Date().toISOString();
  writeGuests(guests);
}
