import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./paths.ts";

export type AdminTaskCategory = "bills" | "shopping" | "admin" | "maintenance" | "other";
export type AdminTaskPriority = "urgent" | "high" | "normal" | "low";
export type AdminTaskStatus = "todo" | "in_progress" | "done";
export type AdminTaskAssignee = "alex" | "mia" | "both";
export type AdminTaskRecurrence = "none" | "daily" | "weekly" | "monthly" | "yearly";

export interface AdminTask {
  id: string;
  title: string;
  description?: string;
  category: AdminTaskCategory;
  priority: AdminTaskPriority;
  status: AdminTaskStatus;
  assignee?: AdminTaskAssignee;
  dueDate?: string; // YYYY-MM-DD
  recurrence: AdminTaskRecurrence;
  notes?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

const TASKS_FILE = path.join(DATA_DIR, "admin-tasks.json");

export function readAdminTasks(): AdminTask[] {
  try {
    if (!fs.existsSync(TASKS_FILE)) return [];
    const raw = fs.readFileSync(TASKS_FILE, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[admin-tasks] read error:", msg);
    return [];
  }
}

export function writeAdminTasks(tasks: AdminTask[]): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), "utf8");
}

function newId(): string {
  const hex = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
  return `task-${hex}`;
}

export interface CreateAdminTaskInput {
  title: string;
  description?: string;
  category?: AdminTaskCategory;
  priority?: AdminTaskPriority;
  status?: AdminTaskStatus;
  assignee?: AdminTaskAssignee;
  dueDate?: string;
  recurrence?: AdminTaskRecurrence;
  notes?: string;
}

export function createAdminTask(input: CreateAdminTaskInput): AdminTask {
  const now = new Date().toISOString();
  const task: AdminTask = {
    id: newId(),
    title: input.title.trim(),
    description: input.description?.trim(),
    category: input.category ?? "other",
    priority: input.priority ?? "normal",
    status: input.status ?? "todo",
    assignee: input.assignee,
    dueDate: input.dueDate,
    recurrence: input.recurrence ?? "none",
    notes: input.notes?.trim(),
    createdAt: now,
    updatedAt: now,
  };
  const tasks = readAdminTasks();
  tasks.push(task);
  writeAdminTasks(tasks);
  return task;
}

export type UpdateAdminTaskPatch = Partial<
  Pick<
    AdminTask,
    | "title"
    | "description"
    | "category"
    | "priority"
    | "status"
    | "assignee"
    | "dueDate"
    | "recurrence"
    | "notes"
  >
>;

export function getNextDueDate(current: string, recurrence: AdminTaskRecurrence): string {
  const d = new Date(current + "T12:00:00");
  switch (recurrence) {
    case "daily":
      d.setDate(d.getDate() + 1);
      break;
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      break;
  }
  return d.toISOString().slice(0, 10);
}

export function updateAdminTask(id: string, patch: UpdateAdminTaskPatch): AdminTask | null {
  const tasks = readAdminTasks();
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx === -1) return null;

  const now = new Date().toISOString();
  const current = tasks[idx]!;
  const completingNow = patch.status === "done" && current.status !== "done";

  const updated: AdminTask = {
    ...current,
    ...(patch.title !== undefined && { title: patch.title.trim() }),
    ...(patch.description !== undefined && { description: patch.description.trim() }),
    ...(patch.category !== undefined && { category: patch.category }),
    ...(patch.priority !== undefined && { priority: patch.priority }),
    ...(patch.status !== undefined && { status: patch.status }),
    ...(patch.assignee !== undefined && { assignee: patch.assignee }),
    ...(patch.dueDate !== undefined && { dueDate: patch.dueDate }),
    ...(patch.recurrence !== undefined && { recurrence: patch.recurrence }),
    ...(patch.notes !== undefined && { notes: patch.notes.trim() }),
    ...(completingNow && { completedAt: now }),
    updatedAt: now,
  };

  // If uncompleting, clear completedAt
  if (patch.status && patch.status !== "done") {
    delete updated.completedAt;
  }

  tasks[idx] = updated;

  // Spawn a new recurring instance if task is done and has recurrence + dueDate
  const effectiveRecurrence =
    patch.recurrence !== undefined ? patch.recurrence : current.recurrence;
  const effectiveDueDate = patch.dueDate !== undefined ? patch.dueDate : current.dueDate;

  if (completingNow && effectiveRecurrence !== "none" && effectiveDueDate) {
    const nextDue = getNextDueDate(effectiveDueDate, effectiveRecurrence);
    const nextTask: AdminTask = {
      id: newId(),
      title: updated.title,
      description: updated.description,
      category: updated.category,
      priority: updated.priority,
      status: "todo",
      assignee: updated.assignee,
      dueDate: nextDue,
      recurrence: effectiveRecurrence,
      notes: updated.notes,
      createdAt: now,
      updatedAt: now,
    };
    tasks.push(nextTask);
  }

  writeAdminTasks(tasks);
  return updated;
}

export function deleteAdminTask(id: string): boolean {
  const tasks = readAdminTasks();
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx === -1) return false;
  tasks.splice(idx, 1);
  writeAdminTasks(tasks);
  return true;
}
