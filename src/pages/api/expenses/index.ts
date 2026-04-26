import type { APIRoute } from "astro";
import { VALID_EXPENSE_CATEGORIES, VALID_ACCOUNTING_SCOPES } from "../../../lib/constants.ts";
import {
  createExpense,
  filterExpenses,
  readExpenses,
  isValidExpenseCategory,
  isValidAccountingScope,
} from "../../../lib/expenses.ts";
import { json, jsonError } from "../../../lib/api-response.ts";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const category = url.searchParams.get("category");
  const scopeRaw = url.searchParams.get("scope");
  const scope = scopeRaw === "business" || scopeRaw === "personal" ? scopeRaw : null;

  const all = readExpenses();
  const expenses = filterExpenses(all, { from, to, category, scope });
  const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);

  const byCategory: Record<string, { total: number; count: number }> = {};
  for (const e of expenses) {
    const k = e.category;
    if (!byCategory[k]) byCategory[k] = { total: 0, count: 0 };
    byCategory[k].total += e.amount;
    byCategory[k].count += 1;
  }

  return json({
    expenses,
    meta: {
      total: expenses.length,
      totalAmount,
      byCategory,
      categories: [...VALID_EXPENSE_CATEGORIES],
      scopes: [...VALID_ACCOUNTING_SCOPES],
    },
  });
};

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  const date = typeof body.date === "string" ? body.date : "";
  const vendor = typeof body.vendor === "string" ? body.vendor : "";
  const category = typeof body.category === "string" ? body.category : "";
  const amount = body.amount;
  const notes = typeof body.notes === "string" ? body.notes : "";
  const currency = typeof body.currency === "string" ? body.currency : "THB";
  const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : undefined;
  const imageMimeType = typeof body.imageMimeType === "string" ? body.imageMimeType : undefined;
  const source =
    body.source === "mcp" || body.source === "dashboard" || body.source === "manual"
      ? body.source
      : "dashboard";

  let scope: "business" | "personal" | undefined;
  if (body.scope !== undefined) {
    if (typeof body.scope !== "string" || !isValidAccountingScope(body.scope)) {
      return jsonError("scope must be business or personal");
    }
    scope = body.scope;
  }

  if (!DATE_RE.test(date)) {
    return jsonError("date must be YYYY-MM-DD");
  }
  if (!vendor.trim()) {
    return jsonError("vendor is required");
  }
  if (!isValidExpenseCategory(category)) {
    return jsonError(`category must be one of: ${VALID_EXPENSE_CATEGORIES.join(", ")}`);
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
    return jsonError("amount must be a non-negative number");
  }

  const result = createExpense({
    date,
    amount,
    vendor,
    category,
    scope,
    notes,
    currency,
    source,
    imageBase64,
    imageMimeType,
  });

  if ("error" in result) {
    return jsonError(result.error);
  }

  return json(result, 201);
};
