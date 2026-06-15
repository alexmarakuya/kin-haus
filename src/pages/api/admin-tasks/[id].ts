import type { APIRoute } from "astro";
import crypto from "node:crypto";
import {
  readAdminTasks,
  updateAdminTask,
  deleteAdminTask,
  completeTask,
} from "../../../lib/admin-tasks.ts";
import type {
  AdminTaskCategory,
  AdminTaskRecurrence,
  AdminTaskAssignee,
  AdminTaskPriority,
  AdminTaskStatus,
  AdminTaskSubtask,
} from "../../../lib/types.ts";
import { json, jsonError } from "../../../lib/api-response.ts";
import { oneOf } from "../../../lib/validate.ts";

const VALID_CATEGORIES: AdminTaskCategory[] = [
  "payment",
  "payroll",
  "accounting",
  "housekeeping",
  "maintenance",
  "procurement",
  "guest-admin",
  "other",
];
const VALID_RECURRENCES: AdminTaskRecurrence[] = [
  "none",
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "yearly",
];
const VALID_ASSIGNEES: AdminTaskAssignee[] = ["alex", "mia", "both"];
const VALID_PRIORITIES: AdminTaskPriority[] = ["urgent", "high", "normal", "low"];
const VALID_ANCHORS = ["interval", "calendar-day"] as const;
const VALID_ROOMS = ["nest", "master", "nomad", "theater"] as const;
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

    // Completing a task goes through completeTask() for recurrence spawning
    if (body.status === "done") {
      const actualAmount =
        typeof body.actualAmount === "number" && body.actualAmount >= 0
          ? body.actualAmount
          : undefined;
      const result = completeTask(id, actualAmount);
      if (!result) return jsonError("Task not found", 404);
      return json({ task: result.completed, spawned: result.spawned ?? null });
    }

    // All other updates go through updateAdminTask()
    const updates: Partial<Omit<AdminTask, "id" | "createdAt">> = {};

    if (body.title !== undefined) {
      if (typeof body.title !== "string" || !body.title.trim())
        return jsonError("title must be a non-empty string");
      updates.title = body.title.trim();
    }
    if (body.description !== undefined) {
      updates.description = typeof body.description === "string" ? body.description.trim() : "";
    }
    if (body.category !== undefined) {
      if (!VALID_CATEGORIES.includes(body.category as AdminTaskCategory))
        return jsonError(`category must be one of: ${VALID_CATEGORIES.join(", ")}`);
      updates.category = body.category as AdminTaskCategory;
    }
    if (body.priority !== undefined) {
      if (!VALID_PRIORITIES.includes(body.priority as AdminTaskPriority))
        return jsonError(`priority must be one of: ${VALID_PRIORITIES.join(", ")}`);
      updates.priority = body.priority as AdminTaskPriority;
    }
    if (body.status !== undefined) {
      const VALID_STATUSES: AdminTaskStatus[] = ["todo", "in_progress", "done"];
      if (!VALID_STATUSES.includes(body.status as AdminTaskStatus))
        return jsonError(`status must be one of: ${VALID_STATUSES.join(", ")}`);
      updates.status = body.status as AdminTaskStatus;
      // Un-completing: clear completedAt
      if (body.status !== "done") updates.completedAt = undefined;
    }
    if (body.assignee !== undefined) {
      if (body.assignee === null || body.assignee === "") {
        updates.assignee = "alex"; // fallback default
      } else {
        if (!VALID_ASSIGNEES.includes(body.assignee as AdminTaskAssignee))
          return jsonError(`assignee must be one of: ${VALID_ASSIGNEES.join(", ")}`);
        updates.assignee = body.assignee as AdminTaskAssignee;
      }
    }
    if (body.dueDate !== undefined) {
      if (body.dueDate === null || body.dueDate === "") {
        updates.dueDate = undefined;
      } else if (typeof body.dueDate !== "string" || !DATE_RE.test(body.dueDate)) {
        return jsonError("dueDate must be YYYY-MM-DD");
      } else {
        updates.dueDate = body.dueDate;
      }
    }
    if (body.recurrence !== undefined) {
      if (!VALID_RECURRENCES.includes(body.recurrence as AdminTaskRecurrence))
        return jsonError(`recurrence must be one of: ${VALID_RECURRENCES.join(", ")}`);
      updates.recurrence = body.recurrence as AdminTaskRecurrence;
    }
    if (body.recurrenceAnchor !== undefined) {
      if (!VALID_ANCHORS.includes(body.recurrenceAnchor as (typeof VALID_ANCHORS)[number]))
        return jsonError("recurrenceAnchor must be 'interval' or 'calendar-day'");
      updates.recurrenceAnchor = body.recurrenceAnchor as "interval" | "calendar-day";
    }
    if (body.recurrenceDay !== undefined) {
      if (body.recurrenceDay === null) {
        updates.recurrenceDay = undefined;
      } else {
        const rd = Number(body.recurrenceDay);
        if (!Number.isInteger(rd) || rd < 1 || (rd > 28 && rd !== 31))
          return jsonError("recurrenceDay must be 1–28 or 31");
        updates.recurrenceDay = rd;
      }
    }
    if (body.subtasks !== undefined) {
      if (!Array.isArray(body.subtasks)) return jsonError("subtasks must be an array");
      updates.subtasks = (body.subtasks as AdminTaskSubtask[]).map((s) => ({
        id: s.id || crypto.randomUUID(),
        label: String(s.label),
        done: Boolean(s.done),
      }));
    }
    if (body.vendorId !== undefined) {
      updates.vendorId = typeof body.vendorId === "string" ? body.vendorId : undefined;
    }
    if (body.amount !== undefined) {
      updates.amount =
        body.amount === null
          ? undefined
          : typeof body.amount === "number"
            ? body.amount
            : undefined;
    }
    if (body.actualAmount !== undefined) {
      updates.actualAmount =
        body.actualAmount === null
          ? undefined
          : typeof body.actualAmount === "number"
            ? body.actualAmount
            : undefined;
    }
    if (body.room !== undefined) {
      if (body.room === null || body.room === "") {
        updates.room = undefined;
      } else if (!VALID_ROOMS.includes(body.room as (typeof VALID_ROOMS)[number])) {
        return jsonError(`room must be one of: ${VALID_ROOMS.join(", ")}`);
      } else {
        updates.room = body.room as string;
      }
    }
    if (body.notes !== undefined) {
      updates.notes = typeof body.notes === "string" ? body.notes.trim() : "";
    }

    const task = updateAdminTask(id, updates);
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

// Local type alias to satisfy TypeScript without re-importing
type AdminTask = import("../../../lib/types.ts").AdminTask;
