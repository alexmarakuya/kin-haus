import type { APIRoute } from "astro";
import { readExpenses } from "../../../lib/expenses.ts";
import { readIncomes } from "../../../lib/income.ts";
import { buildAccountingSummary } from "../../../lib/accounting-summary.ts";
import { json } from "../../../lib/api-response.ts";

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const summary = buildAccountingSummary(readExpenses(), readIncomes(), from, to);

  return json({ summary });
};
