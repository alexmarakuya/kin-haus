import type { APIRoute } from "astro";
import { readAdminTasks, seedDefaultTasks } from "../../../lib/admin-tasks.ts";
import { json, jsonError } from "../../../lib/api-response.ts";

/** Seed default recurring tasks. Idempotent: returns 409 if tasks already exist.
 *  Use ?force=true to re-seed even when tasks are present. */
export const GET: APIRoute = async ({ url }) => {
  try {
    const force = url.searchParams.get("force") === "true";
    const existing = readAdminTasks();
    if (existing.length > 0 && !force) {
      return jsonError(`${existing.length} tasks already exist. Use ?force=true to re-seed.`, 409);
    }
    const tasks = seedDefaultTasks();
    return json({ seeded: tasks.length, tasks });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/admin-tasks/seed] error:", msg);
    return jsonError("Internal server error", 500);
  }
};
