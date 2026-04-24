import type { APIRoute } from "astro";
import {
  findPortalByToken,
  markStepComplete,
  updatePortal,
} from "../../../../lib/guest-portals.ts";
import { saveGuestProfile } from "../../../../lib/guests.ts";
import {
  readManualBookings,
  writeManualBookings,
  readOverrides,
  writeOverrides,
} from "../../../../lib/bookings.ts";
import { json, jsonError } from "../../../../lib/api-response.ts";

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { token, fullName, nationality, gender, passportNumber } = body;

    if (!token) return jsonError("token is required");
    const portal = findPortalByToken(token);
    if (!portal) return jsonError("Portal not found", 404);

    if (!fullName || !fullName.trim()) return jsonError("Full name is required");

    const guest = saveGuestProfile({
      fullName: fullName.trim(),
      nationality: nationality || undefined,
      gender: gender || undefined,
      passportNumber: passportNumber || undefined,
      bookingIds: [portal.bookingId],
    });

    updatePortal(token, { guestId: guest.id });

    // Mark TM30 as submitted on the booking
    const bookings = readManualBookings();
    const booking = bookings.find((b) => b.id === portal.bookingId);
    if (booking) {
      booking.tm30Status = "submitted";
      writeManualBookings(bookings);
    } else {
      // Airbnb booking: use overrides
      const overrides = readOverrides();
      overrides[portal.bookingId] = { ...overrides[portal.bookingId], tm30Status: "submitted" };
      writeOverrides(overrides);
    }

    markStepComplete(token, "tm30");

    console.log(`[guest-portal] TM30 submitted for ${guest.fullName} (portal ${portal.id})`);
    return json({ success: true, guestId: guest.id });
  } catch (err: any) {
    console.error("[api] guest-portal/step/tm30 error:", err);
    return jsonError("Failed to save TM30 details", 500, err.message);
  }
};
