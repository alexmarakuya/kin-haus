import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "./paths.ts";
import type { Vendor, VendorType, VendorPaymentMethod } from "./types.ts";

export type { Vendor, VendorType, VendorPaymentMethod };

const VENDORS_FILE = path.join(DATA_DIR, "vendors.json");

export function readVendors(): Vendor[] {
  try {
    if (!fs.existsSync(VENDORS_FILE)) return [];
    const raw = fs.readFileSync(VENDORS_FILE, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[vendors] read error:", msg);
    return [];
  }
}

export function writeVendors(vendors: Vendor[]): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(VENDORS_FILE, JSON.stringify(vendors, null, 2), "utf8");
}

export function createVendor(data: Omit<Vendor, "id" | "createdAt" | "updatedAt">): Vendor {
  const vendors = readVendors();
  const now = new Date().toISOString();
  const vendor: Vendor = {
    currency: "THB",
    ...data,
    id: crypto.randomUUID(),
    active: data.active ?? true,
    createdAt: now,
    updatedAt: now,
  };
  vendors.push(vendor);
  writeVendors(vendors);
  return vendor;
}

export function updateVendor(
  id: string,
  updates: Partial<Omit<Vendor, "id" | "createdAt">>,
): Vendor | null {
  const vendors = readVendors();
  const idx = vendors.findIndex((v) => v.id === id);
  if (idx === -1) return null;
  vendors[idx] = { ...vendors[idx]!, ...updates, updatedAt: new Date().toISOString() };
  writeVendors(vendors);
  return vendors[idx]!;
}

export function deleteVendor(id: string): boolean {
  const vendors = readVendors();
  const idx = vendors.findIndex((v) => v.id === id);
  if (idx === -1) return false;
  vendors.splice(idx, 1);
  writeVendors(vendors);
  return true;
}
