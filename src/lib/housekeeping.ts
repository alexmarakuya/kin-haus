import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { HousekeepingTask, HousekeepingStatus, HousekeepingTaskType } from './types.ts';

const DATA_DIR = path.join(process.cwd(), 'data');
const HK_FILE = path.join(DATA_DIR, 'housekeeping.json');

export function readTasks(): HousekeepingTask[] {
  try {
    if (!fs.existsSync(HK_FILE)) return [];
    const raw = fs.readFileSync(HK_FILE, 'utf8');
    const data = JSON.parse(raw);
    // Migrate from old flat map format if needed
    if (data && !Array.isArray(data)) return [];
    return data;
  } catch (err: any) {
    console.error('[housekeeping] error reading file:', err.message);
    return [];
  }
}

export function writeTasks(tasks: HousekeepingTask[]): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(HK_FILE, JSON.stringify(tasks, null, 2), 'utf8');
}

export function getTasksForMonth(month: string): HousekeepingTask[] {
  return readTasks().filter(t => t.date.startsWith(month));
}

export function getTasksForDay(date: string, room?: string): HousekeepingTask[] {
  return readTasks().filter(t => t.date === date && (!room || t.room === room));
}

export function createTask(data: {
  date: string;
  room: string;
  type: HousekeepingTaskType;
  title: string;
  status?: HousekeepingStatus;
  assigneeId?: string;
  notes?: string;
  auto?: boolean;
}): HousekeepingTask {
  const tasks = readTasks();
  const task: HousekeepingTask = {
    id: crypto.randomUUID(),
    date: data.date,
    room: data.room,
    type: data.type,
    title: data.title,
    status: data.status || 'pending',
    assigneeId: data.assigneeId,
    notes: data.notes,
    auto: data.auto,
    createdAt: new Date().toISOString(),
  };
  tasks.push(task);
  writeTasks(tasks);
  return task;
}

export function updateTask(id: string, updates: Partial<Pick<HousekeepingTask, 'title' | 'status' | 'type' | 'assigneeId' | 'notes'>>): HousekeepingTask | null {
  const tasks = readTasks();
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return null;
  tasks[idx] = { ...tasks[idx], ...updates };
  writeTasks(tasks);
  return tasks[idx];
}

export function deleteTask(id: string): boolean {
  const tasks = readTasks();
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return false;
  tasks.splice(idx, 1);
  writeTasks(tasks);
  return true;
}

// Auto-generate a turnover cleaning task if one doesn't already exist
export function ensureTurnoverTask(date: string, room: string, guestName?: string): HousekeepingTask | null {
  const tasks = readTasks();
  const exists = tasks.find(t => t.date === date && t.room === room && t.auto);
  if (exists) return exists;
  return createTask({
    date,
    room,
    type: 'cleaning',
    title: `Turnover clean${guestName ? ` (after ${guestName})` : ''}`,
    auto: true,
  });
}
