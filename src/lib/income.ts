import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Income } from "./types.ts";
import {
  VALID_ACCOUNTING_SCOPES,
  VALID_INCOME_CATEGORIES,
  VALID_INCOME_DEPOSIT_ACCOUNTS,
} from "./constants.ts";
import {
  deleteReceiptFileIfExists,
  parseBase64Image,
  receiptFilePath,
  saveReceiptFile,
} from "./expenses.ts";

const DATA_DIR = path.join(process.cwd(), "data");
const INCOMES_FILE = path.join(DATA_DIR, "incomes.json");

export function readIncomes(): Income[] {
  try {
    if (!fs.existsSync(INCOMES_FILE)) return [];
    const raw = fs.readFileSync(INCOMES_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeIncomeRow);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[income] read error:", msg);
    return [];
  }
}

function normalizeIncomeRow(row: Income): Income {
  const scope = row.scope === "personal" ? "personal" : "business";
  const deposit = isValidDepositAccount(row.depositAccount) ? row.depositAccount : "other";
  const category = isValidIncomeCategory(row.category) ? row.category : "other";
  return { ...row, scope, depositAccount: deposit, category };
}

export function writeIncomes(incomes: Income[]): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(INCOMES_FILE, JSON.stringify(incomes, null, 2), "utf8");
}

export function findIncome(id: string): Income | undefined {
  return readIncomes().find((i) => i.id === id);
}

function newIncomeId(): string {
  return `inc-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

export function isValidIncomeCategory(c: string): c is Income["category"] {
  return (VALID_INCOME_CATEGORIES as readonly string[]).includes(c);
}

export function isValidDepositAccount(a: string): a is Income["depositAccount"] {
  return (VALID_INCOME_DEPOSIT_ACCOUNTS as readonly string[]).includes(a);
}

export function isValidIncomeScope(s: string): s is Income["scope"] {
  return (VALID_ACCOUNTING_SCOPES as readonly string[]).includes(s);
}

export interface CreateIncomeInput {
  date: string;
  amount: number;
  description: string;
  category: Income["category"];
  depositAccount: Income["depositAccount"];
  scope: Income["scope"];
  notes?: string;
  currency?: string;
  source?: Income["source"];
  imageBase64?: string;
  imageMimeType?: string;
}

export function createIncome(input: CreateIncomeInput): Income | { error: string } {
  const id = newIncomeId();
  const now = new Date().toISOString();
  let imageFilename: string | undefined;

  if (input.imageBase64) {
    const parsed = parseBase64Image(input.imageBase64, input.imageMimeType);
    if ("error" in parsed) return parsed;
    const saved = saveReceiptFile(id, parsed.buffer, parsed.mime);
    if (typeof saved !== "string") return saved;
    imageFilename = saved;
  }

  const income: Income = {
    id,
    date: input.date,
    amount: input.amount,
    currency: input.currency?.trim() || "THB",
    description: input.description.trim(),
    category: input.category,
    depositAccount: input.depositAccount,
    scope: input.scope === "personal" ? "personal" : "business",
    notes: (input.notes ?? "").trim(),
    imageFilename,
    source: input.source ?? "manual",
    createdAt: now,
    updatedAt: now,
  };

  const all = readIncomes();
  all.push(income);
  writeIncomes(all);
  return income;
}

export function updateIncome(
  id: string,
  patch: Partial<
    Pick<
      Income,
      | "date"
      | "amount"
      | "currency"
      | "description"
      | "category"
      | "depositAccount"
      | "scope"
      | "notes"
      | "source"
    >
  > & {
    imageBase64?: string;
    imageMimeType?: string;
    clearImage?: boolean;
  },
): Income | { error: string } | null {
  const all = readIncomes();
  const idx = all.findIndex((i) => i.id === id);
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

  const next: Income = {
    ...cur,
    ...(patch.date !== undefined && { date: patch.date }),
    ...(patch.amount !== undefined && { amount: patch.amount }),
    ...(patch.currency !== undefined && { currency: patch.currency.trim() || cur.currency }),
    ...(patch.description !== undefined && { description: patch.description.trim() }),
    ...(patch.category !== undefined && { category: patch.category }),
    ...(patch.depositAccount !== undefined && { depositAccount: patch.depositAccount }),
    ...(patch.scope !== undefined && {
      scope: patch.scope === "personal" ? "personal" : "business",
    }),
    ...(patch.notes !== undefined && { notes: patch.notes.trim() }),
    ...(patch.source !== undefined && { source: patch.source }),
    imageFilename,
    updatedAt: new Date().toISOString(),
  };

  all[idx] = next;
  writeIncomes(all);
  return next;
}

export function deleteIncome(id: string): boolean {
  const all = readIncomes();
  const idx = all.findIndex((i) => i.id === id);
  if (idx < 0) return false;
  const [removed] = all.splice(idx, 1);
  if (removed) deleteReceiptFileIfExists(removed.imageFilename);
  writeIncomes(all);
  return true;
}

export function filterIncomes(
  incomes: Income[],
  opts: {
    from?: string | null;
    to?: string | null;
    category?: string | null;
    depositAccount?: string | null;
    scope?: "business" | "personal" | null;
  },
): Income[] {
  let list = [...incomes];
  if (opts.from) list = list.filter((i) => i.date >= opts.from!);
  if (opts.to) list = list.filter((i) => i.date <= opts.to!);
  if (opts.category && isValidIncomeCategory(opts.category)) {
    list = list.filter((i) => i.category === opts.category);
  }
  if (opts.depositAccount && isValidDepositAccount(opts.depositAccount)) {
    list = list.filter((i) => i.depositAccount === opts.depositAccount);
  }
  if (opts.scope === "business" || opts.scope === "personal") {
    list = list.filter((i) => i.scope === opts.scope);
  }
  list.sort((a, b) =>
    a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date),
  );
  return list;
}

export { receiptFilePath };
