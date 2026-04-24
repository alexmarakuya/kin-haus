import type { APIRoute } from "astro";
import { getCacheStatus } from "../../lib/cache.ts";
import { readManualBookings } from "../../lib/bookings.ts";
import { jsonError } from "../../lib/api-response.ts";

export const GET: APIRoute = async () => {
  try {
    return new Response(
      JSON.stringify({
        status: "ok",
        cache: getCacheStatus(),
        manualBookings: readManualBookings().length,
        uptime: Math.round(process.uptime()) + "s",
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/status] error:", msg);
    return jsonError("Internal server error", 500);
  }
};
