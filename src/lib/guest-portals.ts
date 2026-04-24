import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { GuestPortal, PortalStep } from "./types.ts";

const DATA_DIR = path.join(process.cwd(), "data");
const PORTALS_FILE = path.join(DATA_DIR, "guest-portals.json");

export function readPortals(): GuestPortal[] {
  try {
    if (!fs.existsSync(PORTALS_FILE)) return [];
    const raw = fs.readFileSync(PORTALS_FILE, "utf8");
    return JSON.parse(raw);
  } catch (err: any) {
    console.error("[guest-portals] error reading file:", err.message);
    return [];
  }
}

export function writePortals(portals: GuestPortal[]): void {
  fs.writeFileSync(PORTALS_FILE, JSON.stringify(portals, null, 2), "utf8");
}

export function findPortalByToken(token: string): GuestPortal | undefined {
  return readPortals().find((p) => p.token === token);
}

export function findPortalByBooking(bookingId: string): GuestPortal | undefined {
  return readPortals().find((p) => p.bookingId === bookingId);
}

export function generateToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function createPortal(data: {
  bookingId: string;
  guestName: string;
  room: string;
  checkin: string;
  checkout: string;
  guestId?: string;
}): GuestPortal {
  const portals = readPortals();
  const existing = portals.find((p) => p.bookingId === data.bookingId);
  if (existing) return existing;

  const portal: GuestPortal = {
    id: `portal-${Date.now()}`,
    token: generateToken(),
    bookingId: data.bookingId,
    guestName: data.guestName,
    room: data.room,
    checkin: data.checkin,
    checkout: data.checkout,
    guestId: data.guestId,
    completedSteps: [],
    createdAt: new Date().toISOString(),
  };

  portals.push(portal);
  writePortals(portals);
  console.log(`[guest-portals] created: ${portal.id} for booking ${portal.bookingId}`);
  return portal;
}

export function markStepComplete(token: string, step: PortalStep): GuestPortal | null {
  const portals = readPortals();
  const portal = portals.find((p) => p.token === token);
  if (!portal) return null;

  if (!portal.completedSteps.includes(step)) {
    portal.completedSteps.push(step);
  }
  writePortals(portals);
  return portal;
}

export function updatePortal(token: string, updates: Partial<GuestPortal>): GuestPortal | null {
  const portals = readPortals();
  const idx = portals.findIndex((p) => p.token === token);
  if (idx === -1) return null;

  const portal = portals[idx];
  if (updates.arrivalInfo) portal.arrivalInfo = updates.arrivalInfo;
  if (updates.feedback) portal.feedback = updates.feedback;
  if (updates.guestId) portal.guestId = updates.guestId;
  if (updates.completedSteps) portal.completedSteps = updates.completedSteps;

  portals[idx] = portal;
  writePortals(portals);
  return portal;
}
