import type { APIRoute } from "astro";
import { findPortalByToken } from "../../../lib/guest-portals.ts";
import { findUpsellByPortal } from "../../../lib/guest-upsells.ts";
import { readGuests } from "../../../lib/guests.ts";
import { readManualBookings } from "../../../lib/bookings.ts";
import { readMonitors } from "../../../lib/monitor-rentals.ts";
import { ROOM_LABELS } from "../../../lib/constants.ts";
import { json, jsonError } from "../../../lib/api-response.ts";

export const GET: APIRoute = async ({ params }) => {
  try {
    const { token } = params;
    if (!token) return jsonError("Token required", 400);

    const portal = findPortalByToken(token);
    if (!portal) return jsonError("Portal not found", 404);

    const upsell = findUpsellByPortal(portal.id);

    let guestProfile = null;
    let bookingHistory: { room: string; checkin: string; checkout: string }[] = [];
    if (portal.guestId) {
      const guests = readGuests();
      guestProfile = guests.find((g) => g.id === portal.guestId) || null;
    }
    if (!guestProfile && portal.guestName) {
      const guests = readGuests();
      const lower = portal.guestName.toLowerCase().trim();
      guestProfile = guests.find((g) => g.fullName.toLowerCase() === lower) || null;
    }

    if (guestProfile && guestProfile.bookingIds.length > 0) {
      const allBookings = readManualBookings();
      bookingHistory = guestProfile.bookingIds
        .map((id) => allBookings.find((b) => b.id === id))
        .filter((b): b is NonNullable<typeof b> => !!b && b.id !== portal.bookingId)
        .map((b) => ({
          room: ROOM_LABELS[b.room] || b.room,
          checkin: b.checkin,
          checkout: b.checkout,
        }))
        .sort((a, b) => b.checkin.localeCompare(a.checkin));
    }

    const monitors = readMonitors();
    const availableMonitors = monitors.filter((m) => m.status === "available");
    const monitorRate = availableMonitors.length > 0 ? availableMonitors[0].dailyRate : 200;

    const today = new Date().toISOString().slice(0, 10);
    let phase: "pre-arrival" | "during-stay" | "post-checkout" = "pre-arrival";
    if (today >= portal.checkout) phase = "post-checkout";
    else if (today >= portal.checkin) phase = "during-stay";

    return json({
      portal,
      upsell: upsell || null,
      guestProfile: guestProfile
        ? {
            fullName: guestProfile.fullName,
            nationality: guestProfile.nationality,
            gender: guestProfile.gender,
            passportNumber: guestProfile.passportNumber,
            totalStays: guestProfile.totalStays,
            tags: guestProfile.tags,
          }
        : null,
      bookingHistory,
      roomLabel: ROOM_LABELS[portal.room] || portal.room,
      monitorRate,
      monitorsAvailable: availableMonitors.length,
      phase,
    });
  } catch (err: any) {
    console.error("[api] /api/guest-portal/[token] GET error:", err);
    return jsonError("Failed to load portal", 500, err.message);
  }
};
