import type { APIRoute } from "astro";
import { updateAdminTask, deleteAdminTask, readAdminTasks } from "../../../lib/admin-tasks.ts";
import type {
  AdminTaskCategory,
  AdminTaskPriority,
  AdminTaskStatus,
  AdminTaskAssignee,
  AdminTaskRecurrence,
  UpdateAdminTaskPatch,
} from "../../../lib/admin-tasks.ts";
import { json, jsonError } from "../../../lib/api-response.ts";

const VALID_CATEGORIES: AdminTaskCategory[] = [
  "bills",
  "shopping",
  "admin",
  "maintenance",
  "other",
];
const VALID_PRIORITIES: AdminTaskPriority[] = ["urgent", "high", "normal", "low"];
const VALID_STATUSES: AdminTaskStatus[] = ["todo", "in_progress", "done"];
const VALID_ASSIGNEES: AdminTaskAssignee[] = ["alex", "mia", "both"];
const VALID_RECURRENCES: AdminTaskRecurrence[] = ["none", "daily", "weekly", "monthly", "yearly"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const PATCH: APIRoute = async ({ params, request }) => {
  try {
    const id = params.id;
    if (!id) return jsonError("Missing id", 404);

    const all = readAdminTasks();
    if (!all.find((t) => t.id === id)) return jsonError("Task not found", 404);

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON body");
    }

    const patch: UpdateAdminTaskPatch = {};

    if (body.title !== undefined) {
      if (typeof body.title !== "string" || !body.title.trim()) {
        return jsonError("title must be a non-empty string");
      }
      patch.title = body.title;
    }
    if (body.description !== undefined) {
      patch.description = typeof body.description === "string" ? body.description : "";
    }
    if (body.category !== undefined) {
      if (!VALID_CATEGORIES.includes(body.category as AdminTaskCategory)) {
        return jsonError(`category must be one of: ${VALID_CATEGORIES.join(", ")}`);
      }
      patch.category = body.category as AdminTaskCategory;
    }
    if (body.priority !== undefined) {
      if (!VALID_PRIORITIES.includes(body.priority as AdminTaskPriority)) {
        return jsonError(`priority must be one of: ${VALID_PRIORITIES.join(", ")}`);
      }
      patch.priority = body.priority as AdminTaskPriority;
    }
    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status as AdminTaskStatus)) {
        return jsonError(`status must be one of: ${VALID_STATUSES.join(", ")}`);
      }
      patch.status = body.status as AdminTaskStatus;
    }
    if (body.assignee !== undefined) {
      // Allow null/empty string to unset assignee
      if (body.assignee === null || body.assignee === "") {
        patch.assignee = undefined;
      } else if (!VALID_ASSIGNEES.includes(body.assignee as AdminTaskAssignee)) {
        return jsonError(`assignee must be one of: ${VALID_ASSIGNEES.join(", ")}`);
      } else {
        patch.assignee = body.assignee as AdminTaskAssignee;
      }
    }
    if (body.dueDate !== undefined) {
      if (body.dueDate === null || body.dueDate === "") {
        patch.dueDate = undefined;
      } else if (typeof body.dueDate !== "string" || !DATE_RE.test(body.dueDate)) {
        return jsonError("dueDate must be YYYY-MM-DD");
      } else {
        patch.dueDate = body.dueDate;
      }
    }
    if (body.recurrence !== undefined) {
      if (!VALID_RECURRENCES.includes(body.recurrence as AdminTaskRecurrence)) {
        return jsonError(`recurrence must be one of: ${VALID_RECURRENCES.join(", ")}`);
      }
      patch.recurrence = body.recurrence as AdminTaskRecurrence;
    }
    if (body.notes !== undefined) {
      patch.notes = typeof body.notes === "string" ? body.notes : "";
    }

    const task = updateAdminTask(id, patch);
    if (!task) return jsonError("Task not found", 404);

    return json({ task });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/admin-tasks/[id]] PATCH error:", msg);
    return jsonError("Internal server error", 500);
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const id = params.id;
    if (!id) return jsonError("Missing id", 404);

    const ok = deleteAdminTask(id);
    if (!ok) return jsonError("Task not found", 404);

    return json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/admin-tasks/[id]] DELETE error:", msg);
    return jsonError("Internal server error", 500);
  }
};
