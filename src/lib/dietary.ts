import fs from "node:fs";
import path from "node:path";
import type { DietaryRequirements } from "./types.ts";

const DATA_DIR = path.join(process.cwd(), "data");
const DIETARY_FILE = path.join(DATA_DIR, "dietary.json");

export function readDietary(): DietaryRequirements[] {
  try {
    if (!fs.existsSync(DIETARY_FILE)) return [];
    const raw = fs.readFileSync(DIETARY_FILE, "utf8");
    return JSON.parse(raw);
  } catch (err: any) {
    console.error("[dietary] error reading file:", err.message);
    return [];
  }
}

export function writeDietary(entries: DietaryRequirements[]): void {
  fs.writeFileSync(DIETARY_FILE, JSON.stringify(entries, null, 2), "utf8");
}
