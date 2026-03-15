import fs from 'node:fs';
import path from 'node:path';
import type { Monitor, MonitorRental } from './types.ts';

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'monitor-rentals.json');

interface MonitorRentalData {
  monitors: Monitor[];
  rentals: MonitorRental[];
}

function readData(): MonitorRentalData {
  try {
    if (!fs.existsSync(DATA_FILE)) return { monitors: [], rentals: [] };
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(raw) as MonitorRentalData;
    // Backward compat: map legacy 'active' status to 'delivered'
    for (const r of data.rentals) {
      if ((r.status as string) === 'active') {
        r.status = 'delivered';
        if (!r.deliveryDate) r.deliveryDate = r.startDate;
      }
    }
    return data;
  } catch (err: any) {
    console.error('[monitor-rentals] error reading file:', err.message);
    return { monitors: [], rentals: [] };
  }
}

function writeData(data: MonitorRentalData): void {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

export function readMonitors(): Monitor[] {
  return readData().monitors;
}

export function writeMonitors(monitors: Monitor[]): void {
  const data = readData();
  data.monitors = monitors;
  writeData(data);
}

export function readRentals(): MonitorRental[] {
  return readData().rentals;
}

export function writeRentals(rentals: MonitorRental[]): void {
  const data = readData();
  data.rentals = rentals;
  writeData(data);
}

export function getBookedRentals(): MonitorRental[] {
  return readRentals().filter(r => r.status === 'booked');
}

export function getDeliveredRentals(): MonitorRental[] {
  return readRentals().filter(r => r.status === 'delivered');
}

export function getActiveRentals(): MonitorRental[] {
  return readRentals().filter(r => r.status === 'booked' || r.status === 'delivered');
}

export function getCompletedRentals(): MonitorRental[] {
  return readRentals().filter(r => r.status === 'completed');
}

export function getFinishedRentals(): MonitorRental[] {
  return readRentals().filter(r => r.status === 'completed' || r.status === 'cancelled');
}

/** Calculate days between two YYYY-MM-DD dates */
function daysBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

/** Today as YYYY-MM-DD */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Billing start = deliveryDate if set, otherwise startDate */
function billingStart(rental: MonitorRental): string {
  return rental.deliveryDate || rental.startDate;
}

export function calculateRevenue(rental: MonitorRental): number {
  if (rental.status === 'booked' || rental.status === 'cancelled') return 0;
  const endDate = rental.status === 'completed' && rental.completedAt
    ? rental.completedAt.slice(0, 10)
    : today();
  const days = daysBetween(billingStart(rental), endDate);
  return rental.dailyRate * days;
}

export function getDaysRented(rental: MonitorRental): number {
  if (rental.status === 'booked') return 0;
  const endDate = rental.status === 'completed' && rental.completedAt
    ? rental.completedAt.slice(0, 10)
    : today();
  return daysBetween(billingStart(rental), endDate);
}

export function getDaysRemaining(rental: MonitorRental): number | null {
  if (!rental.endDate) return null;
  const ms = new Date(rental.endDate).getTime() - new Date(today()).getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function isOverdue(rental: MonitorRental): boolean {
  if (rental.status !== 'delivered' || !rental.endDate) return false;
  return today() > rental.endDate;
}

export function getMonthlyRevenueSummary(): {
  totalRevenueThisMonth: number;
  activeRentals: number;
  bookedRentals: number;
  availableMonitors: number;
  totalMonitors: number;
  utilisationPercent: number;
} {
  const monitors = readMonitors();
  const rentals = readRentals();
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthEnd = today();

  // Revenue from completed rentals this month
  const completedThisMonth = rentals.filter(r =>
    r.status === 'completed' &&
    r.completedAt &&
    r.completedAt.slice(0, 10) >= monthStart
  );
  let totalRevenue = completedThisMonth.reduce((sum, r) => sum + r.revenue, 0);

  // Add accrued revenue from delivered rentals
  const delivered = rentals.filter(r => r.status === 'delivered');
  for (const r of delivered) {
    const start = billingStart(r);
    const accrualStart = start >= monthStart ? start : monthStart;
    const days = daysBetween(accrualStart, monthEnd);
    totalRevenue += r.dailyRate * days;
  }

  // Utilisation: total rented days this month / (total monitors × days so far in month)
  const daysInMonth = daysBetween(monthStart, monthEnd);
  const totalPossibleDays = monitors.length * daysInMonth;
  let totalRentedDays = 0;

  for (const r of rentals) {
    if (r.status === 'completed' && r.completedAt) {
      const start = billingStart(r);
      const rStart = start >= monthStart ? start : monthStart;
      const end = r.completedAt.slice(0, 10) <= monthEnd ? r.completedAt.slice(0, 10) : monthEnd;
      if (rStart <= end) totalRentedDays += daysBetween(rStart, end);
    } else if (r.status === 'delivered') {
      const start = billingStart(r);
      const rStart = start >= monthStart ? start : monthStart;
      if (rStart <= monthEnd) totalRentedDays += daysBetween(rStart, monthEnd);
    }
  }

  const utilisationPercent = totalPossibleDays > 0
    ? Math.round((totalRentedDays / totalPossibleDays) * 1000) / 10
    : 0;

  return {
    totalRevenueThisMonth: totalRevenue,
    activeRentals: delivered.length,
    bookedRentals: rentals.filter(r => r.status === 'booked').length,
    availableMonitors: monitors.filter(m => m.status === 'available').length,
    totalMonitors: monitors.length,
    utilisationPercent,
  };
}
