import type { APIRoute } from "astro";
import {
  VALID_INCOME_CATEGORIES,
  VALID_INCOME_DEPOSIT_ACCOUNTS,
  VALID_ACCOUNTING_SCOPES,
} from "../../../lib/constants.ts";
import {
  createIncome,
  filterIncomes,
  readIncomes,
  isValidIncomeCategory,
  isValidDepositAccount,
  isValidIncomeScope,
} from "../../../lib/income.ts";
import { json, jsonError } from "../../../lib/api-response.ts";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const category = url.searchParams.get("category");
  const depositAccount = url.searchParams.get("depositAccount");
  const scopeRaw = url.searchParams.get("scope");
  const scope = scopeRaw === "business" || scopeRaw === "personal" ? scopeRaw : null;

  const all = readIncomes();
  const incomes = filterIncomes(all, { from, to, category, depositAccount, scope });
  const totalAmount = incomes.reduce((s, i) => s + i.amount, 0);

  const byCategory: Record<string, { total: number; count: number }> = {};
  for (const i of incomes) {
    const k = i.category;
    if (!byCategory[k]) byCategory[k] = { total: 0, count: 0 };
    byCategory[k].total += i.amount;
    byCategory[k].count += 1;
  }

  return json({
    incomes,
    meta: {
      total: incomes.length,
      totalAmount,
      byCategory,
      categories: [...VALID_INCOME_CATEGORIES],
      depositAccounts: [...VALID_INCOME_DEPOSIT_ACCOUNTS],
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
  const description = typeof body.description === "string" ? body.description : "";
  const category = typeof body.category === "string" ? body.category : "";
  const depositAccount = typeof body.depositAccount === "string" ? body.depositAccount : "";
  const scopeStr = typeof body.scope === "string" ? body.scope : "business";
  const amount = body.amount;
  const notes = typeof body.notes === "string" ? body.notes : "";
  const currency = typeof body.currency === "string" ? body.currency : "THB";
  const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : undefined;
  const imageMimeType = typeof body.imageMimeType === "string" ? body.imageMimeType : undefined;
  const source =
    body.source === "mcp" || body.source === "dashboard" || body.source === "manual"
      ? body.source
      : "dashboard";

  if (!DATE_RE.test(date)) {
    return jsonError("date must be YYYY-MM-DD");
  }
  if (!description.trim()) {
    return jsonError("description is required");
  }
  if (!isValidIncomeCategory(category)) {
    return jsonError(`category must be one of: ${VALID_INCOME_CATEGORIES.join(", ")}`);
  }
  if (!isValidDepositAccount(depositAccount)) {
    return jsonError(`depositAccount must be one of: ${VALID_INCOME_DEPOSIT_ACCOUNTS.join(", ")}`);
  }
  if (!isValidIncomeScope(scopeStr)) {
    return jsonError(`scope must be one of: ${VALID_ACCOUNTING_SCOPES.join(", ")}`);
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
    return jsonError("amount must be a non-negative number");
  }

  const result = createIncome({
    date,
    amount,
    description,
    category,
    depositAccount,
    scope: scopeStr,
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
