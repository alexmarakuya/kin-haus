import type { APIRoute } from "astro";
import { updateHousekeeper, deleteHousekeeper } from "../../../lib/housekeepers.ts";
import { json, jsonError } from "../../../lib/api-response.ts";

export const PATCH: APIRoute = async ({ params, request }) => {
  try {
    const { id } = params;
    if (!id) return jsonError("Missing housekeeper ID");

    const body = await request.json().catch(() => null);
    if (!body) return jsonError("Invalid JSON body");

    const hk = updateHousekeeper(id, body);
    if (!hk) return jsonError("Housekeeper not found", 404);

    return json({ housekeeper: hk });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/housekeepers/:id] error:", msg);
    return jsonError("Internal server error", 500);
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const { id } = params;
    if (!id) return jsonError("Missing housekeeper ID");

    const deleted = deleteHousekeeper(id);
    if (!deleted) return jsonError("Housekeeper not found", 404);

    return json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/housekeepers/:id] error:", msg);
    return jsonError("Internal server error", 500);
  }
};
