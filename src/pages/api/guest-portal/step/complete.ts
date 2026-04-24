import type { APIRoute } from "astro";
import { findPortalByToken, markStepComplete } from "../../../../lib/guest-portals.ts";
import type { PortalStep } from "../../../../lib/types.ts";
import { json, jsonError } from "../../../../lib/api-response.ts";

const VALID_STEPS: PortalStep[] = ["welcome", "tm30", "dietary", "extras", "arrival", "practical"];

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { token, step } = body;

    if (!token) return jsonError("token is required");
    if (!step || !VALID_STEPS.includes(step)) return jsonError("Invalid step");

    const portal = findPortalByToken(token);
    if (!portal) return jsonError("Portal not found", 404);

    markStepComplete(token, step);
    return json({ success: true });
  } catch (err: any) {
    console.error("[api] guest-portal/step/complete error:", err);
    return jsonError("Failed to mark step complete", 500, err.message);
  }
};
