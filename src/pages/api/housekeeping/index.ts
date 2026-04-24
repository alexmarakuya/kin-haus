import type { APIRoute } from "astro";
import {
  readTasks,
  getTasksForMonth,
  createTask,
  updateTask,
  deleteTask,
} from "../../../lib/housekeeping.ts";
import { json, jsonError } from "../../../lib/api-response.ts";
import { VALID_ROOMS } from "../../../lib/constants.ts";
import type { HousekeepingStatus, HousekeepingTaskType } from "../../../lib/types.ts";

const VALID_STATUSES: HousekeepingStatus[] = ["pending", "in_progress", "done"];
const VALID_TYPES: HousekeepingTaskType[] = [
  "cleaning",
  "maintenance",
  "laundry",
  "inspection",
  "other",
];
const VALID_TASK_ROOMS = [...VALID_ROOMS, "common"];

export const GET: APIRoute = async ({ url }) => {
  try {
    const month = url.searchParams.get("month");
    const tasks = month ? getTasksForMonth(month) : readTasks();
    return json({ tasks });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/housekeeping] error:", msg);
    return jsonError("Internal server error", 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => null);
    if (!body) return jsonError("Invalid JSON body");

    const { date, room, type, title, assigneeId, notes } = body;
    if (!date || !room || !title) return jsonError("Missing date, room, or title");
    if (!VALID_TASK_ROOMS.includes(room)) return jsonError(`Invalid room: ${room}`);
    if (type && !VALID_TYPES.includes(type))
      return jsonError(`Invalid type. Use: ${VALID_TYPES.join(", ")}`);

    const task = createTask({
      date,
      room,
      type: type || "other",
      title,
      assigneeId,
      notes,
    });

    return json({ task }, 201);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/housekeeping] error:", msg);
    return jsonError("Internal server error", 500);
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => null);
    if (!body?.id) return jsonError("Missing task id");

    const { id, status, title, type, assigneeId, notes } = body;

    if (status && !VALID_STATUSES.includes(status)) {
      return jsonError(`Invalid status. Use: ${VALID_STATUSES.join(", ")}`);
    }
    if (type && !VALID_TYPES.includes(type)) {
      return jsonError(`Invalid type. Use: ${VALID_TYPES.join(", ")}`);
    }

    const updates: Record<string, any> = {};
    if (status !== undefined) updates.status = status;
    if (title !== undefined) updates.title = title;
    if (type !== undefined) updates.type = type;
    if (assigneeId !== undefined) updates.assigneeId = assigneeId;
    if (notes !== undefined) updates.notes = notes;

    const task = updateTask(id, updates);
    if (!task) return jsonError("Task not found", 404);

    return json({ task });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/housekeeping] error:", msg);
    return jsonError("Internal server error", 500);
  }
};

export const DELETE: APIRoute = async ({ url }) => {
  try {
    const id = url.searchParams.get("id");
    if (!id) return jsonError("Missing task id");

    const deleted = deleteTask(id);
    if (!deleted) return jsonError("Task not found", 404);

    return json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/housekeeping] error:", msg);
    return jsonError("Internal server error", 500);
  }
};
