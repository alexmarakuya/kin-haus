import type { APIRoute } from "astro";
import { findPortalByToken, markStepComplete } from "../../../../lib/guest-portals.ts";
import { saveUpsell, findUpsellByPortal } from "../../../../lib/guest-upsells.ts";
import { json, jsonError } from "../../../../lib/api-response.ts";

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { token, wantMonitor, wantScooter } = body;

    if (!token) return jsonError("token is required");
    const portal = findPortalByToken(token);
    if (!portal) return jsonError("Portal not found", 404);

    const existingUpsell = findUpsellByPortal(portal.id);
    saveUpsell({
      portalId: portal.id,
      bookingId: portal.bookingId,
      guestName: portal.guestName,
      privateChef: existingUpsell?.privateChef || {
        interested: false,
        people: 0,
        pricePerPerson: 1000,
      },
      monitorRental: { interested: !!wantMonitor },
      scooterRental: { interested: !!wantScooter, dailyRate: 300 },
    });

    markStepComplete(token, "extras");

    console.log(
      `[guest-portal] extras submitted for ${portal.guestName} (monitor: ${wantMonitor ? "yes" : "no"}, scooter: ${wantScooter ? "yes" : "no"})`,
    );
    return json({ success: true });
  } catch (err: any) {
    console.error("[api] guest-portal/step/upsells error:", err);
    return jsonError("Failed to save extras", 500, err.message);
  }
};
