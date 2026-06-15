import type { APIRoute } from "astro";
import { readAdminTasks, createAdminTask } from "../../../lib/admin-tasks.ts";
import type {
  AdminTaskCategory,
  AdminTaskPriority,
  AdminTaskStatus,
  AdminTaskAssignee,
  AdminTaskRecurrence,
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

export const GET: APIRoute = async ({ url }) => {
  try {
    const statusFilter = url.searchParams.get("status");
    const categoryFilter = url.searchParams.get("category");
    const assigneeFilter = url.searchParams.get("assignee");

    let tasks = readAdminTasks();

    if (statusFilter) {
      tasks = tasks.filter((t) => t.status === statusFilter);
    }
    if (categoryFilter) {
      tasks = tasks.filter((t) => t.category === categoryFilter);
    }
    if (assigneeFilter) {
      tasks = tasks.filter((t) => t.assignee === assigneeFilter);
    }

    const today = new Date().toISOString().slice(0, 10);

    // Compute meta
    const total = tasks.length;

    const byCat: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    let overdueCount = 0;

    for (const t of tasks) {
      byCat[t.category] = (byCat[t.category] || 0) + 1;
      byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
      if (t.status !== "done" && t.dueDate && t.dueDate < today) {
        overdueCount++;
      }
    }

    return json({ tasks, meta: { total, byCat, byPriority, overdueCount } });
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

    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return jsonError("title is required");

    const category =
      typeof body.category === "string" &&
      VALID_CATEGORIES.includes(body.category as AdminTaskCategory)
        ? (body.category as AdminTaskCategory)
        : "other";

    const priority =
      typeof body.priority === "string" &&
      VALID_PRIORITIES.includes(body.priority as AdminTaskPriority)
        ? (body.priority as AdminTaskPriority)
        : "normal";

    const status =
      typeof body.status === "string" && VALID_STATUSES.includes(body.status as AdminTaskStatus)
        ? (body.status as AdminTaskStatus)
        : "todo";

    const assignee =
      typeof body.assignee === "string" &&
      VALID_ASSIGNEES.includes(body.assignee as AdminTaskAssignee)
        ? (body.assignee as AdminTaskAssignee)
        : undefined;

    const recurrence =
      typeof body.recurrence === "string" &&
      VALID_RECURRENCES.includes(body.recurrence as AdminTaskRecurrence)
        ? (body.recurrence as AdminTaskRecurrence)
        : "none";

    const dueDate =
      typeof body.dueDate === "string" && DATE_RE.test(body.dueDate) ? body.dueDate : undefined;

    if (body.dueDate !== undefined && !dueDate) {
      return jsonError("dueDate must be YYYY-MM-DD");
    }

    const description = typeof body.description === "string" ? body.description : undefined;
    const notes = typeof body.notes === "string" ? body.notes : undefined;

    const task = createAdminTask({
      title,
      description,
      category,
      priority,
      status,
      assignee,
      dueDate,
      recurrence,
      notes,
    });

    return json({ task }, 201);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/admin-tasks] POST error:", msg);
    return jsonError("Internal server error", 500);
  }
};
