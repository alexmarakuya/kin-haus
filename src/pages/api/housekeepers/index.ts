import type { APIRoute } from "astro";
import { readHousekeepers, createHousekeeper } from "../../../lib/housekeepers.ts";
import { json, jsonError } from "../../../lib/api-response.ts";

export const GET: APIRoute = async () => {
  try {
    const housekeepers = readHousekeepers();
    return json({ housekeepers });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/housekeepers] error:", msg);
    return jsonError("Internal server error", 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => null);
    if (!body?.name) return jsonError("Name is required");

    const hk = createHousekeeper({
      name: body.name,
      role: body.role,
      phone: body.phone,
      lineId: body.lineId,
      messenger: body.messenger,
      email: body.email,
      assignedRooms: body.assignedRooms,
      availableDays: body.availableDays,
      notes: body.notes,
      rate: body.rate,
    });

    return json({ housekeeper: hk }, 201);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/housekeepers] error:", msg);
    return jsonError("Internal server error", 500);
  }
};
