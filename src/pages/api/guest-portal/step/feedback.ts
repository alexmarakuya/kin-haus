import type { APIRoute } from "astro";
import { findPortalByToken, updatePortal } from "../../../../lib/guest-portals.ts";
import { json, jsonError } from "../../../../lib/api-response.ts";

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { token, rating, comment } = body;

    if (!token) return jsonError("token is required");
    const portal = findPortalByToken(token);
    if (!portal) return jsonError("Portal not found", 404);

    const ratingNum = parseInt(rating);
    if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
      return jsonError("Rating must be between 1 and 5");
    }

    updatePortal(token, {
      feedback: {
        rating: ratingNum,
        comment: comment || "",
        submittedAt: new Date().toISOString(),
      },
    });

    console.log(`[guest-portal] feedback submitted for ${portal.guestName} (${ratingNum}/5)`);
    return json({ success: true });
  } catch (err: any) {
    console.error("[api] guest-portal/step/feedback error:", err);
    return jsonError("Failed to save feedback", 500, err.message);
  }
};
