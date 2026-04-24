import type { APIRoute } from "astro";
import { VALID_EXPENSE_CATEGORIES } from "../../../lib/constants.ts";
import {
  deleteExpense,
  findExpense,
  updateExpense,
  isValidExpenseCategory,
  isValidAccountingScope,
} from "../../../lib/expenses.ts";
import { json, jsonError } from "../../../lib/api-response.ts";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GET: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id) return jsonError("Missing id", 404);

  const expense = findExpense(id);
  if (!expense) return jsonError("Not found", 404);

  return json({ expense });
};

export const PATCH: APIRoute = async ({ params, request }) => {
  const id = params.id;
  if (!id) return jsonError("Missing id", 404);

  if (!findExpense(id)) return jsonError("Not found", 404);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body");
  }

  const patch: Parameters<typeof updateExpense>[1] = {};

  if (body.date !== undefined) {
    if (typeof body.date !== "string" || !DATE_RE.test(body.date)) {
      return jsonError("date must be YYYY-MM-DD");
    }
    patch.date = body.date;
  }
  if (body.vendor !== undefined) {
    if (typeof body.vendor !== "string" || !body.vendor.trim()) {
      return jsonError("vendor must be a non-empty string");
    }
    patch.vendor = body.vendor;
  }
  if (body.category !== undefined) {
    if (typeof body.category !== "string" || !isValidExpenseCategory(body.category)) {
      return jsonError(`category must be one of: ${VALID_EXPENSE_CATEGORIES.join(", ")}`);
    }
    patch.category = body.category;
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
  if (body.scope !== undefined) {
    if (typeof body.scope !== "string" || !isValidAccountingScope(body.scope)) {
      return jsonError("scope must be business or personal");
    }
    patch.scope = body.scope;
  }
  if (body.clearImage === true) {
    patch.clearImage = true;
  }
  if (typeof body.imageBase64 === "string" && body.imageBase64.length > 0) {
    patch.imageBase64 = body.imageBase64;
    patch.imageMimeType = typeof body.imageMimeType === "string" ? body.imageMimeType : undefined;
  }

  const result = updateExpense(id, patch);
  if (result === null) return jsonError("Not found", 404);
  if ("error" in result) return jsonError(result.error);

  return json({ expense: result });
};

export const DELETE: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id) return jsonError("Missing id", 404);

  const ok = deleteExpense(id);
  if (!ok) return jsonError("Not found", 404);

  return json({ ok: true });
};
