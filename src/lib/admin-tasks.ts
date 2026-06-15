import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "./paths.ts";
import type {
  AdminTask,
  AdminTaskCategory,
  AdminTaskRecurrence,
  AdminTaskAssignee,
  AdminTaskPriority,
  AdminTaskStatus,
  AdminTaskSubtask,
} from "./types.ts";

export type {
  AdminTask,
  AdminTaskCategory,
  AdminTaskRecurrence,
  AdminTaskAssignee,
  AdminTaskPriority,
  AdminTaskStatus,
  AdminTaskSubtask,
};

const TASKS_FILE = path.join(DATA_DIR, "admin-tasks.json");

// ─── Persistence ──────────────────────────────────────────────────────────────

export function readAdminTasks(): AdminTask[] {
  try {
    if (!fs.existsSync(TASKS_FILE)) return [];
    const raw = fs.readFileSync(TASKS_FILE, "utf8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    // Migration shim: backfill fields added after initial release
    return data.map((t: AdminTask) => ({
      subtasks: [],
      recurrenceAnchor: "interval" as const,
      ...t,
    }));
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

// ─── Recurrence helpers ───────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Interval-based: next due date is N days/months/years after fromDate. */
export function getNextDueDate(recurrence: AdminTaskRecurrence, fromDate: string): string {
  const d = new Date(fromDate + "T12:00:00");
  switch (recurrence) {
    case "daily":
      d.setDate(d.getDate() + 1);
      break;
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "biweekly":
      d.setDate(d.getDate() + 14);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      return fromDate;
  }
  return toDateStr(d);
}

/**
 * Calendar-day-anchored: next due date is always on recurrenceDay of the
 * NEXT calendar month, regardless of when completion happened.
 *
 * recurrenceDay: 1–28 = exact day; 31 = sentinel for "last day of month".
 */
export function getNextDueDateCalendar(recurrenceDay: number, fromDate: string): string {
  const from = new Date(fromDate + "T12:00:00");
  // Advance one month (0-indexed: month+1 becomes month+2 in 1-indexed)
  let year = from.getFullYear();
  let month = from.getMonth() + 2; // getMonth() is 0-indexed, so +1 for that, +1 to advance
  if (month > 12) {
    month = 1;
    year++;
  }
  if (recurrenceDay === 31) {
    // Last day of target month: day 0 of month+1
    return new Date(year, month, 0).toISOString().slice(0, 10);
  }
  const maxDay = new Date(year, month, 0).getDate();
  const day = Math.min(recurrenceDay, maxDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ─── Completion + recurrence spawn ───────────────────────────────────────────

export function completeTask(
  id: string,
  actualAmount?: number,
): { completed: AdminTask; spawned?: AdminTask } | null {
  const tasks = readAdminTasks();
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx === -1) return null;

  const task = tasks[idx]!;
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  task.status = "done";
  task.completedAt = now;
  task.updatedAt = now;
  if (actualAmount !== undefined) task.actualAmount = actualAmount;

  let spawned: AdminTask | undefined;

  if (task.recurrence !== "none") {
    const fromDate = task.dueDate || today;
    let nextDue: string;
    if (task.recurrenceAnchor === "calendar-day" && task.recurrenceDay) {
      nextDue = getNextDueDateCalendar(task.recurrenceDay, fromDate);
    } else {
      nextDue = getNextDueDate(task.recurrence, fromDate);
    }

    spawned = {
      ...task,
      id: crypto.randomUUID(),
      status: "todo",
      dueDate: nextDue,
      completedAt: undefined,
      actualAmount: undefined,
      // Reset subtask checkboxes for the new cycle
      subtasks: (task.subtasks ?? []).map((s) => ({ ...s, done: false })),
      createdAt: now,
      updatedAt: now,
    };
    tasks.push(spawned);
  }

  writeAdminTasks(tasks);
  return { completed: task, spawned };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export function createAdminTask(
  data: Omit<AdminTask, "id" | "createdAt" | "updatedAt">,
): AdminTask {
  const tasks = readAdminTasks();
  const now = new Date().toISOString();
  const task: AdminTask = {
    subtasks: [],
    recurrenceAnchor: "interval",
    ...data,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  tasks.push(task);
  writeAdminTasks(tasks);
  return task;
}

export function updateAdminTask(
  id: string,
  updates: Partial<Omit<AdminTask, "id" | "createdAt">>,
): AdminTask | null {
  const tasks = readAdminTasks();
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  tasks[idx] = { ...tasks[idx]!, ...updates, updatedAt: new Date().toISOString() };
  writeAdminTasks(tasks);
  return tasks[idx]!;
}

export function deleteAdminTask(id: string): boolean {
  const tasks = readAdminTasks();
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx === -1) return false;
  tasks.splice(idx, 1);
  writeAdminTasks(tasks);
  return true;
}

// ─── Pre-seed templates ───────────────────────────────────────────────────────

export function seedDefaultTasks(): AdminTask[] {
  const today = new Date();

  function nextWeekday(dow: number): string {
    // dow: 0=Sun, 1=Mon…
    const d = new Date(today);
    const diff = (dow - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return toDateStr(d);
  }

  function nextNthOfMonth(n: number): string {
    const d = new Date(today.getFullYear(), today.getMonth(), n);
    if (d <= today) d.setMonth(d.getMonth() + 1);
    return toDateStr(d);
  }

  function nextLastDayOfMonth(): string {
    const d = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    if (d <= today) return toDateStr(new Date(today.getFullYear(), today.getMonth() + 2, 0));
    return toDateStr(d);
  }

  const now = new Date().toISOString();

  const seeds: Omit<AdminTask, "id" | "createdAt" | "updatedAt">[] = [
    {
      title: "Weekly Accounting Close",
      description: "Enter all expenses and income for the week. Reconcile against active bookings.",
      category: "accounting",
      priority: "high",
      status: "todo",
      assignee: "both",
      dueDate: nextWeekday(1), // next Monday
      recurrence: "weekly",
      recurrenceAnchor: "interval",
      subtasks: [
        { id: crypto.randomUUID(), label: "All receipts / expenses entered", done: false },
        { id: crypto.randomUUID(), label: "All income recorded", done: false },
        { id: crypto.randomUUID(), label: "Revenue reconciled against bookings", done: false },
      ],
    },
    {
      title: "Payroll — First Half",
      description: "Pay all staff for the first half of the month (1st–15th).",
      category: "payroll",
      priority: "high",
      status: "todo",
      assignee: "alex",
      dueDate: nextNthOfMonth(15),
      recurrence: "monthly",
      recurrenceAnchor: "calendar-day",
      recurrenceDay: 15,
      subtasks: [],
    },
    {
      title: "Payroll — Second Half",
      description: "Pay all staff for the second half of the month (16th–EOM).",
      category: "payroll",
      priority: "high",
      status: "todo",
      assignee: "alex",
      dueDate: nextLastDayOfMonth(),
      recurrence: "monthly",
      recurrenceAnchor: "calendar-day",
      recurrenceDay: 31,
      subtasks: [],
    },
    {
      title: "Monthly Admin Close",
      description: "Confirm payroll processed, review month revenue, check outstanding payments.",
      category: "accounting",
      priority: "normal",
      status: "todo",
      assignee: "both",
      dueDate: nextNthOfMonth(1),
      recurrence: "monthly",
      recurrenceAnchor: "calendar-day",
      recurrenceDay: 1,
      subtasks: [
        { id: crypto.randomUUID(), label: "Both payrolls processed", done: false },
        { id: crypto.randomUUID(), label: "Month revenue reviewed", done: false },
        { id: crypto.randomUUID(), label: "Outstanding guest payments checked", done: false },
      ],
    },
  ];

  const tasks = seeds.map(
    (s): AdminTask => ({ ...s, id: crypto.randomUUID(), createdAt: now, updatedAt: now }),
  );
  writeAdminTasks(tasks);
  return tasks;
}
