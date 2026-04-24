import type { APIRoute } from "astro";
import { readManualBookings } from "../../../lib/bookings.ts";
import { json, jsonError } from "../../../lib/api-response.ts";

export const GET: APIRoute = async () => {
  try {
    return json(readManualBookings());
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/bookings/manual] error:", msg);
    return jsonError("Internal server error", 500);
  }
};
