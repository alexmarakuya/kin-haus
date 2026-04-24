import type { APIRoute } from "astro";
import {
  findPortalByToken,
  markStepComplete,
  updatePortal,
} from "../../../../lib/guest-portals.ts";
import type { ArrivalInfo } from "../../../../lib/types.ts";
import { json, jsonError } from "../../../../lib/api-response.ts";

const VALID_METHODS: ArrivalInfo["method"][] = ["ferry", "flight_ferry", "other"];

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { token, method, arrivalTime, flightOrFerry, wantPickup } = body;

    if (!token) return jsonError("token is required");
    const portal = findPortalByToken(token);
    if (!portal) return jsonError("Portal not found", 404);

    const arrivalMethod = VALID_METHODS.includes(method) ? method : "ferry";

    updatePortal(token, {
      arrivalInfo: {
        method: arrivalMethod,
        arrivalTime: arrivalTime || "",
        flightOrFerry: flightOrFerry || "",
        wantPickup: !!wantPickup,
      },
    });

    markStepComplete(token, "arrival");

    console.log(
      `[guest-portal] arrival info submitted for ${portal.guestName} (${arrivalMethod}, pickup: ${wantPickup ? "yes" : "no"})`,
    );
    return json({ success: true });
  } catch (err: any) {
    console.error("[api] guest-portal/step/arrival error:", err);
    return jsonError("Failed to save arrival info", 500, err.message);
  }
};
