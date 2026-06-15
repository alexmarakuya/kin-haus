import type { APIRoute } from "astro";
import crypto from "node:crypto";
import { readAdminTasks, createAdminTask, seedDefaultTasks } from "../../../lib/admin-tasks.ts";
import type {
  AdminTaskCategory,
  AdminTaskRecurrence,
  AdminTaskAssignee,
  AdminTaskPriority,
  AdminTaskStatus,
  AdminTaskSubtask,
} from "../../../lib/types.ts";
import { json, jsonError } from "../../../lib/api-response.ts";
import { validate, required, isString, oneOf } from "../../../lib/validate.ts";

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
const VALID_STATUSES: AdminTaskStatus[] = ["todo", "in_progress", "done"];
const VALID_ANCHORS = ["interval", "calendar-day"] as const;
const VALID_ROOMS = ["nest", "master", "nomad", "theater"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GET: APIRoute = async ({ url }) => {
  try {
    const statusFilter = url.searchParams.get("status");
    const categoryFilter = url.searchParams.get("category");
    const assigneeFilter = url.searchParams.get("assignee");

    let tasks = readAdminTasks();

    // Auto-seed defaults on first use
    if (tasks.length === 0) {
      tasks = seedDefaultTasks();
    }

    if (statusFilter) tasks = tasks.filter((t) => t.status === statusFilter);
    if (categoryFilter) tasks = tasks.filter((t) => t.category === categoryFilter);
    if (assigneeFilter) tasks = tasks.filter((t) => t.assignee === assigneeFilter);

    const today = new Date().toISOString().slice(0, 10);
    const byCat: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    let overdueCount = 0;

    for (const t of tasks) {
      byCat[t.category] = (byCat[t.category] ?? 0) + 1;
      byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1;
      if (t.status !== "done" && t.dueDate && t.dueDate < today) overdueCount++;
    }

    return json({ tasks, meta: { total: tasks.length, byCat, byPriority, overdueCount } });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/admin-tasks] GET error:", msg);
    return jsonError("Internal server error", 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON body");
    }

    const err = validate(body, {
      title: [required, isString],
      category: [required, oneOf(VALID_CATEGORIES)],
      priority: [required, oneOf(VALID_PRIORITIES)],
      assignee: [required, oneOf(VALID_ASSIGNEES)],
      recurrence: [required, oneOf(VALID_RECURRENCES)],
    });
    if (err) return jsonError(err);

    if (body.dueDate !== undefined && body.dueDate !== null && body.dueDate !== "") {
      if (typeof body.dueDate !== "string" || !DATE_RE.test(body.dueDate)) {
        return jsonError("dueDate must be YYYY-MM-DD");
      }
    }

    if (
      body.recurrenceAnchor !== undefined &&
      !VALID_ANCHORS.includes(body.recurrenceAnchor as (typeof VALID_ANCHORS)[number])
    ) {
      return jsonError("recurrenceAnchor must be 'interval' or 'calendar-day'");
    }

    if (body.recurrenceDay !== undefined) {
      const rd = Number(body.recurrenceDay);
      if (!Number.isInteger(rd) || rd < 1 || (rd > 28 && rd !== 31)) {
        return jsonError("recurrenceDay must be 1–28 or 31 (last day of month)");
      }
    }

    if (body.room !== undefined && body.room !== null && body.room !== "") {
      if (!VALID_ROOMS.includes(body.room as (typeof VALID_ROOMS)[number])) {
        return jsonError(`room must be one of: ${VALID_ROOMS.join(", ")}`);
      }
    }

    if (body.subtasks !== undefined) {
      if (!Array.isArray(body.subtasks)) return jsonError("subtasks must be an array");
      for (const s of body.subtasks as unknown[]) {
        if (
          typeof s !== "object" ||
          s === null ||
          typeof (s as AdminTaskSubtask).label !== "string"
        ) {
          return jsonError("Each subtask must have a string label");
        }
      }
    }

    if (body.amount !== undefined && (typeof body.amount !== "number" || body.amount < 0)) {
      return jsonError("amount must be a non-negative number");
    }

    const status =
      typeof body.status === "string" && VALID_STATUSES.includes(body.status as AdminTaskStatus)
        ? (body.status as AdminTaskStatus)
        : "todo";

    const task = createAdminTask({
      title: (body.title as string).trim(),
      description: typeof body.description === "string" ? body.description.trim() : undefined,
      category: body.category as AdminTaskCategory,
      priority: body.priority as AdminTaskPriority,
      status,
      assignee: body.assignee as AdminTaskAssignee,
      dueDate:
        typeof body.dueDate === "string" && DATE_RE.test(body.dueDate) ? body.dueDate : undefined,
      recurrence: body.recurrence as AdminTaskRecurrence,
      recurrenceAnchor:
        (body.recurrenceAnchor as "interval" | "calendar-day" | undefined) ?? "interval",
      recurrenceDay: body.recurrenceDay !== undefined ? Number(body.recurrenceDay) : undefined,
      subtasks: Array.isArray(body.subtasks)
        ? (body.subtasks as AdminTaskSubtask[]).map((s) => ({
            id: s.id || crypto.randomUUID(),
            label: s.label,
            done: s.done ?? false,
          }))
        : [],
      vendorId: typeof body.vendorId === "string" ? body.vendorId : undefined,
      amount: typeof body.amount === "number" ? body.amount : undefined,
      room: typeof body.room === "string" && body.room ? body.room : undefined,
      notes: typeof body.notes === "string" ? body.notes.trim() : undefined,
    });

    return json({ task }, 201);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/admin-tasks] POST error:", msg);
    return jsonError("Internal server error", 500);
  }
};
