import type { APIRoute } from 'astro';
import { fetchAllIcalBookings } from '../../../lib/ical.ts';
import { readManualBookings, readOverrides } from '../../../lib/bookings.ts';
import { readGuests, saveGuestProfile, syncGuestStats } from '../../../lib/guests.ts';
import { json, jsonError } from '../../../lib/api-response.ts';

/**
 * POST /api/guests/import
 * Scans all bookings (Airbnb + manual), groups by guest name,
 * creates or updates guest profiles, links booking IDs, and syncs stats.
 * Skips generic names like "Reserved", "Blocked", "Not available".
 */
export const POST: APIRoute = async () => {
  try {
    const SKIP_NAMES = new Set([
      'reserved', 'blocked', 'not available', 'unavailable',
      'owner', 'maintenance', 'hold', 'guest', '',
    ]);

    // Fetch all bookings (merged iCal + manual with overrides)
    const icalBookings = await fetchAllIcalBookings(false);
    const manualBookings = readManualBookings().map(b => ({ ...b, source: 'manual' as const }));
    const overrides = readOverrides();
    const allBookings = [...icalBookings, ...manualBookings].map(b => {
      const ov = overrides[b.id];
      if (!ov) return b;
      return {
        ...b,
        amount: ov.amount !== undefined ? ov.amount : b.amount,
        guest: ov.guest !== undefined ? ov.guest : b.guest,
        notes: ov.notes !== undefined ? ov.notes : b.notes,
      };
    });

    // Skip blocked/owner/waitlist bookings and bookings with no guest name
    const relevantBookings = allBookings.filter(b => {
      if (!b.guest) return false;
      const lower = b.guest.toLowerCase().trim();
      if (SKIP_NAMES.has(lower)) return false;
      if (b.type === 'blocked' || b.type === 'owner' || b.type === 'waitlist') return false;
      return true;
    });

    // Group bookings by guest name (normalised)
    const guestMap = new Map<string, { name: string; bookingIds: string[]; source: string }>();
    for (const b of relevantBookings) {
      const normalised = b.guest.trim();
      const key = normalised.toLowerCase();
      if (!guestMap.has(key)) {
        guestMap.set(key, {
          name: normalised,
          bookingIds: [],
          source: b.type === 'airbnb' ? 'airbnb' : 'direct',
        });
      }
      guestMap.get(key)!.bookingIds.push(b.id);
    }

    // Create/update guest profiles
    let created = 0;
    let updated = 0;
    const existingBefore = readGuests();
    const existingNames = new Set(existingBefore.map(g => g.fullName.toLowerCase()));

    for (const [, entry] of guestMap) {
      const wasExisting = existingNames.has(entry.name.toLowerCase());

      saveGuestProfile({
        fullName: entry.name,
        bookingIds: entry.bookingIds,
        source: entry.source,
        tags: [],
      });

      if (wasExisting) {
        updated++;
      } else {
        created++;
      }
    }

    // Sync stats for all guests
    const updatedGuests = readGuests();
    for (const guest of updatedGuests) {
      if (guest.bookingIds.length > 0) {
        syncGuestStats(guest.id, allBookings as any);
      }
    }

    return json({
      imported: created,
      updated,
      total: readGuests().length,
      scannedBookings: relevantBookings.length,
    });
  } catch (err: any) {
    console.error('[api] /api/guests/import error:', err);
    return jsonError('Failed to import guests from bookings', 500, err.message);
  }
};
