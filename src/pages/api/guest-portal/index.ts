import type { APIRoute } from "astro";
import { createPortal, readPortals } from "../../../lib/guest-portals.ts";
import { findGuestByName } from "../../../lib/guests.ts";
import { readManualBookings } from "../../../lib/bookings.ts";
import { json, jsonError } from "../../../lib/api-response.ts";

export const GET: APIRoute = async () => {
  try {
    const portals = readPortals();
    portals.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return json({ portals });
  } catch (err: any) {
    console.error("[api] /api/guest-portal GET error:", err);
    return jsonError("Failed to fetch portals", 500, err.message);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { bookingId } = body;

    if (!bookingId) {
      return jsonError("bookingId is required");
    }

    const bookings = readManualBookings();
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) {
      return jsonError("Booking not found", 404);
    }

    const guest = booking.guest ? findGuestByName(booking.guest) : undefined;

    const portal = createPortal({
      bookingId: booking.id,
      guestName: booking.guest || "Guest",
      room: booking.room,
      checkin: booking.checkin,
      checkout: booking.checkout,
      guestId: guest?.id,
    });

    return json({ portal, url: `/guest/${portal.token}` }, 201);
  } catch (err: any) {
    console.error("[api] /api/guest-portal POST error:", err);
    return jsonError("Failed to create guest portal", 500, err.message);
  }
};
