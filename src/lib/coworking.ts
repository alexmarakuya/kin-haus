import fs from 'node:fs';
import path from 'node:path';
import type { CoworkingPass } from './types.ts';

const DATA_DIR = path.join(process.cwd(), 'data');
const PASSES_FILE = path.join(DATA_DIR, 'coworking.json');

export const TOTAL_DESKS = 5;
export const DEFAULT_PRICING = { day: 350, weekly: 1500, monthly: 5000 } as const;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function readPasses(): CoworkingPass[] {
  try {
    if (!fs.existsSync(PASSES_FILE)) return [];
    const raw = fs.readFileSync(PASSES_FILE, 'utf8');
    const passes = JSON.parse(raw) as CoworkingPass[];
    const t = today();
    let changed = false;
    for (const p of passes) {
      if (p.status === 'active' && p.endDate < t) {
        p.status = 'expired';
        p.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
    if (changed) writePasses(passes);
    return passes;
  } catch (err: any) {
    console.error('[coworking] error reading file:', err.message);
    return [];
  }
}

export function writePasses(passes: CoworkingPass[]): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PASSES_FILE, JSON.stringify(passes, null, 2), 'utf8');
}

export function getActivePasses(): CoworkingPass[] {
  return readPasses().filter(p => p.status === 'active');
}

export function getTodayCheckins(): CoworkingPass[] {
  const t = today();
  return getActivePasses().filter(p => p.checkins.includes(t));
}

export function checkinPass(id: string): CoworkingPass {
  const passes = readPasses();
  const pass = passes.find(p => p.id === id);
  if (!pass) throw new Error('Pass not found');
  if (pass.status !== 'active') throw new Error('Pass is not active');
  const t = today();
  if (pass.checkins.includes(t)) throw new Error('Already checked in today');
  pass.checkins.push(t);
  pass.updatedAt = new Date().toISOString();
  writePasses(passes);
  return pass;
}

export function calculateEndDate(startDate: string, type: CoworkingPass['type']): string {
  const d = new Date(startDate + 'T00:00:00');
  switch (type) {
    case 'day': return startDate; // same day
    case 'weekly': d.setDate(d.getDate() + 6); break;
    case 'monthly': d.setDate(d.getDate() + 29); break;
  }
  return d.toISOString().slice(0, 10);
}

export function getRevenueSummary() {
  const passes = readPasses();
  const t = today();
  const monthStart = t.slice(0, 7); // YYYY-MM
  const active = passes.filter(p => p.status === 'active');
  const checkedInToday = active.filter(p => p.checkins.includes(t));

  // Revenue: passes whose startDate falls in current month
  const thisMonthPasses = passes.filter(p => p.startDate.startsWith(monthStart));
  const totalRevenueThisMonth = thisMonthPasses.reduce((sum, p) => sum + p.amount, 0);

  // Utilisation: total checkin-days this month / (5 desks × days so far)
  const dayOfMonth = parseInt(t.slice(8, 10));
  let checkinDaysThisMonth = 0;
  for (const p of passes) {
    checkinDaysThisMonth += p.checkins.filter(c => c.startsWith(monthStart)).length;
  }
  const maxDeskDays = TOTAL_DESKS * dayOfMonth;
  const utilisationPercent = maxDeskDays > 0 ? Math.round((checkinDaysThisMonth / maxDeskDays) * 100) : 0;

  // Passes by type this month
  const passesByType = { day: 0, weekly: 0, monthly: 0 };
  for (const p of thisMonthPasses) {
    passesByType[p.type]++;
  }

  return {
    totalRevenueThisMonth,
    activePasses: active.length,
    desksAvailableToday: TOTAL_DESKS - checkedInToday.length,
    checkedInToday: checkedInToday.length,
    totalDesks: TOTAL_DESKS,
    utilisationPercent,
    passesByType,
  };
}
