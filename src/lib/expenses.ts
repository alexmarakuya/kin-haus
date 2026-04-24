import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./paths.ts";
import crypto from "node:crypto";
import type { Expense } from "./types.ts";
import { VALID_EXPENSE_CATEGORIES, VALID_ACCOUNTING_SCOPES } from "./constants.ts";

const EXPENSES_FILE = path.join(DATA_DIR, "expenses.json");
const RECEIPTS_DIR = path.join(DATA_DIR, "receipts");

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const ALLOWED_MIMES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function ensureReceiptsDir(): void {
  if (!fs.existsSync(RECEIPTS_DIR)) {
    fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
  }
}

function normalizeExpenseRow(e: Expense): Expense {
  const scope = e.scope === "personal" ? "personal" : "business";
  return { ...e, scope };
}

export function readExpenses(): Expense[] {
  try {
    if (!fs.existsSync(EXPENSES_FILE)) return [];
    const raw = fs.readFileSync(EXPENSES_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((x: Expense) => normalizeExpenseRow(x)) : [];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[expenses] read error:", msg);
    return [];
  }
}

export function writeExpenses(expenses: Expense[]): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(EXPENSES_FILE, JSON.stringify(expenses, null, 2), "utf8");
}

export function findExpense(id: string): Expense | undefined {
  return readExpenses().find((e) => e.id === id);
}

export function receiptFilePath(filename: string): string {
  const base = path.basename(filename);
  return path.join(RECEIPTS_DIR, base);
}

export function parseBase64Image(
  input: string,
  explicitMime?: string,
): { buffer: Buffer; mime: string } | { error: string } {
  let mime = explicitMime?.toLowerCase().trim() || "image/jpeg";
  let b64 = input.trim();

  const dataUrl = /^data:([^;]+);base64,(.+)$/s.exec(b64);
  if (dataUrl) {
    mime = dataUrl[1].toLowerCase().trim();
    b64 = dataUrl[2].replace(/\s/g, "");
  } else {
    b64 = b64.replace(/\s/g, "");
  }

  if (!ALLOWED_MIMES[mime]) {
    return { error: `Unsupported image type: ${mime}. Use image/jpeg, image/png, or image/webp.` };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(b64, "base64");
  } catch {
    return { error: "Invalid base64 image data." };
  }

  if (buffer.length === 0) {
    return { error: "Empty image data." };
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    return { error: `Image too large (max ${MAX_IMAGE_BYTES / 1024 / 1024} MB).` };
  }

  return { buffer, mime };
}

export function saveReceiptFile(
  expenseId: string,
  buffer: Buffer,
  mime: string,
): string | { error: string } {
  const ext = ALLOWED_MIMES[mime];
  if (!ext) {
    return { error: `Unsupported image type: ${mime}` };
  }
  ensureReceiptsDir();
  const filename = `${expenseId}.${ext}`;
  const full = path.join(RECEIPTS_DIR, filename);
  try {
    fs.writeFileSync(full, buffer);
    return filename;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: msg };
  }
}

export function deleteReceiptFileIfExists(filename: string | undefined): void {
  if (!filename) return;
  const full = receiptFilePath(filename);
  try {
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch {
    /* ignore */
  }
}

function newExpenseId(): string {
  return `exp-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

export function isValidExpenseCategory(c: string): c is Expense["category"] {
  return (VALID_EXPENSE_CATEGORIES as readonly string[]).includes(c);
}

export function isValidAccountingScope(s: string): s is NonNullable<Expense["scope"]> {
  return (VALID_ACCOUNTING_SCOPES as readonly string[]).includes(s);
}

export interface CreateExpenseInput {
  date: string;
  amount: number;
  vendor: string;
  category: Expense["category"];
  scope?: Expense["scope"];
  notes?: string;
  currency?: string;
  source?: Expense["source"];
  imageBase64?: string;
  imageMimeType?: string;
}

export function createExpense(input: CreateExpenseInput): Expense | { error: string } {
  const id = newExpenseId();
  const now = new Date().toISOString();
  let imageFilename: string | undefined;

  if (input.imageBase64) {
    const parsed = parseBase64Image(input.imageBase64, input.imageMimeType);
    if ("error" in parsed) return parsed;
    const saved = saveReceiptFile(id, parsed.buffer, parsed.mime);
    if (typeof saved !== "string") return saved;
    imageFilename = saved;
  }

  const expense: Expense = {
    id,
    date: input.date,
    amount: input.amount,
    currency: input.currency?.trim() || "THB",
    vendor: input.vendor.trim(),
    category: input.category,
    scope: input.scope === "personal" ? "personal" : "business",
    notes: (input.notes ?? "").trim(),
    imageFilename,
    source: input.source ?? "manual",
    createdAt: now,
    updatedAt: now,
  };

  const all = readExpenses();
  all.push(expense);
  writeExpenses(all);
  return expense;
}

export function updateExpense(
  id: string,
  patch: Partial<
    Pick<
      Expense,
      "date" | "amount" | "currency" | "vendor" | "category" | "scope" | "notes" | "source"
    >
  > & {
    imageBase64?: string;
    imageMimeType?: string;
    clearImage?: boolean;
  },
): Expense | { error: string } | null {
  const all = readExpenses();
  const idx = all.findIndex((e) => e.id === id);
  if (idx < 0) return null;

  const cur = all[idx]!;
  let imageFilename = cur.imageFilename;

  if (patch.clearImage) {
    deleteReceiptFileIfExists(imageFilename);
    imageFilename = undefined;
  }

  if (patch.imageBase64) {
    deleteReceiptFileIfExists(imageFilename);
    const parsed = parseBase64Image(patch.imageBase64, patch.imageMimeType);
    if ("error" in parsed) return parsed;
    const saved = saveReceiptFile(id, parsed.buffer, parsed.mime);
    if (typeof saved !== "string") return saved;
    imageFilename = saved;
  }

  const next: Expense = {
    ...cur,
    ...(patch.date !== undefined && { date: patch.date }),
    ...(patch.amount !== undefined && { amount: patch.amount }),
    ...(patch.currency !== undefined && { currency: patch.currency.trim() || cur.currency }),
    ...(patch.vendor !== undefined && { vendor: patch.vendor.trim() }),
    ...(patch.category !== undefined && { category: patch.category }),
    ...(patch.scope !== undefined && {
      scope: patch.scope === "personal" ? "personal" : "business",
    }),
    ...(patch.notes !== undefined && { notes: patch.notes.trim() }),
    ...(patch.source !== undefined && { source: patch.source }),
    imageFilename,
    updatedAt: new Date().toISOString(),
  };

  all[idx] = next;
  writeExpenses(all);
  return next;
}

export function deleteExpense(id: string): boolean {
  const all = readExpenses();
  const idx = all.findIndex((e) => e.id === id);
  if (idx < 0) return false;
  const [removed] = all.splice(idx, 1);
  if (removed) deleteReceiptFileIfExists(removed.imageFilename);
  writeExpenses(all);
  return true;
}

export function filterExpenses(
  expenses: Expense[],
  opts: {
    from?: string | null;
    to?: string | null;
    category?: string | null;
    scope?: "business" | "personal" | null;
  },
): Expense[] {
  let list = [...expenses];
  if (opts.from) {
    list = list.filter((e) => e.date >= opts.from!);
  }
  if (opts.to) {
    list = list.filter((e) => e.date <= opts.to!);
  }
  if (opts.category && isValidExpenseCategory(opts.category)) {
    list = list.filter((e) => e.category === opts.category);
  }
  if (opts.scope === "business" || opts.scope === "personal") {
    list = list.filter((e) => (e.scope ?? "business") === opts.scope);
  }
  list.sort((a, b) =>
    a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date),
  );
  return list;
}
