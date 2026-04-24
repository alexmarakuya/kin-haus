import fs from "node:fs";
import path from "node:path";
import type { GuestUpsell } from "./types.ts";

const DATA_DIR = path.join(process.cwd(), "data");
const UPSELLS_FILE = path.join(DATA_DIR, "guest-upsells.json");

export function readUpsells(): GuestUpsell[] {
  try {
    if (!fs.existsSync(UPSELLS_FILE)) return [];
    const raw = fs.readFileSync(UPSELLS_FILE, "utf8");
    return JSON.parse(raw);
  } catch (err: any) {
    console.error("[guest-upsells] error reading file:", err.message);
    return [];
  }
}

export function writeUpsells(upsells: GuestUpsell[]): void {
  fs.writeFileSync(UPSELLS_FILE, JSON.stringify(upsells, null, 2), "utf8");
}

export function findUpsellByPortal(portalId: string): GuestUpsell | undefined {
  return readUpsells().find((u) => u.portalId === portalId);
}

export function saveUpsell(data: {
  portalId: string;
  bookingId: string;
  guestName: string;
  privateChef: GuestUpsell["privateChef"];
  monitorRental: GuestUpsell["monitorRental"];
  scooterRental: GuestUpsell["scooterRental"];
}): GuestUpsell {
  const upsells = readUpsells();
  const now = new Date().toISOString();
  const existing = upsells.find((u) => u.portalId === data.portalId);

  if (existing) {
    existing.privateChef = data.privateChef;
    existing.monitorRental = data.monitorRental;
    existing.scooterRental = data.scooterRental;
    existing.updatedAt = now;
    writeUpsells(upsells);
    return existing;
  }

  const upsell: GuestUpsell = {
    id: `upsell-${Date.now()}`,
    portalId: data.portalId,
    bookingId: data.bookingId,
    guestName: data.guestName,
    privateChef: data.privateChef,
    monitorRental: data.monitorRental,
    scooterRental: data.scooterRental,
    createdAt: now,
    updatedAt: now,
  };

  upsells.push(upsell);
  writeUpsells(upsells);
  return upsell;
}
