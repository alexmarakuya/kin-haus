import type { APIRoute } from "astro";
import {
  VALID_INCOME_CATEGORIES,
  VALID_INCOME_DEPOSIT_ACCOUNTS,
  VALID_ACCOUNTING_SCOPES,
} from "../../../lib/constants.ts";
import {
  deleteIncome,
  findIncome,
  updateIncome,
  isValidIncomeCategory,
  isValidDepositAccount,
  isValidIncomeScope,
} from "../../../lib/income.ts";
import { json, jsonError } from "../../../lib/api-response.ts";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GET: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id) return jsonError("Missing id", 404);

  const income = findIncome(id);
  if (!income) return jsonError("Not found", 404);

  return json({ income });
};

export const PATCH: APIRoute = async ({ params, request }) => {
  const id = params.id;
  if (!id) return jsonError("Missing id", 404);

  if (!findIncome(id)) return jsonError("Not found", 404);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  const patch: Parameters<typeof updateIncome>[1] = {};

  if (body.date !== undefined) {
    if (typeof body.date !== "string" || !DATE_RE.test(body.date)) {
      return jsonError("date must be YYYY-MM-DD");
    }
    patch.date = body.date;
  }
  if (body.description !== undefined) {
    if (typeof body.description !== "string" || !body.description.trim()) {
      return jsonError("description must be a non-empty string");
    }
    patch.description = body.description;
  }
  if (body.category !== undefined) {
    if (typeof body.category !== "string" || !isValidIncomeCategory(body.category)) {
      return jsonError(`category must be one of: ${VALID_INCOME_CATEGORIES.join(", ")}`);
    }
    patch.category = body.category;
  }
  if (body.depositAccount !== undefined) {
    if (typeof body.depositAccount !== "string" || !isValidDepositAccount(body.depositAccount)) {
      return jsonError(
        `depositAccount must be one of: ${VALID_INCOME_DEPOSIT_ACCOUNTS.join(", ")}`,
      );
    }
    patch.depositAccount = body.depositAccount;
  }
  if (body.scope !== undefined) {
    if (typeof body.scope !== "string" || !isValidIncomeScope(body.scope)) {
      return jsonError(`scope must be one of: ${VALID_ACCOUNTING_SCOPES.join(", ")}`);
    }
    patch.scope = body.scope;
  }
  if (body.amount !== undefined) {
    if (typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount < 0) {
      return jsonError("amount must be a non-negative number");
    }
    patch.amount = body.amount;
  }
  if (body.currency !== undefined) {
    if (typeof body.currency !== "string") {
      return jsonError("currency must be a string");
    }
    patch.currency = body.currency;
  }
  if (body.notes !== undefined) {
    if (typeof body.notes !== "string") {
      return jsonError("notes must be a string");
    }
    patch.notes = body.notes;
  }
  if (body.source !== undefined) {
    if (body.source !== "mcp" && body.source !== "dashboard" && body.source !== "manual") {
      return jsonError("source must be manual, mcp, or dashboard");
    }
    patch.source = body.source;
  }
  if (body.clearImage === true) {
    patch.clearImage = true;
  }
  if (typeof body.imageBase64 === "string" && body.imageBase64.length > 0) {
    patch.imageBase64 = body.imageBase64;
    patch.imageMimeType = typeof body.imageMimeType === "string" ? body.imageMimeType : undefined;
  }

  const result = updateIncome(id, patch);
  if (result === null) return jsonError("Not found", 404);
  if ("error" in result) return jsonError(result.error);

  return json({ income: result });
};

export const DELETE: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id) return jsonError("Missing id", 404);

  const ok = deleteIncome(id);
  if (!ok) return jsonError("Not found", 404);

  return json({ ok: true });
};
