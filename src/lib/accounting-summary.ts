import type { Expense, Income } from "./types.ts";
import { filterExpenses } from "./expenses.ts";
import { filterIncomes } from "./income.ts";

function sumAmounts<T extends { amount: number }>(rows: T[]): number {
  return rows.reduce((s, r) => s + r.amount, 0);
}

export interface AccountingSummary {
  range: { from: string | null; to: string | null };
  business: {
    incomeTotal: number;
    expenseTotal: number;
    net: number;
    incomeCount: number;
    expenseCount: number;
  };
  personal: {
    incomeTotal: number;
    expenseTotal: number;
    incomeCount: number;
    expenseCount: number;
  };
  /** Income totals by deposit account (all scopes, same date filter). */
  incomeByDepositAccount: Record<string, { total: number; count: number }>;
}

export function buildAccountingSummary(
  expenses: Expense[],
  incomes: Income[],
  from: string | null,
  to: string | null,
): AccountingSummary {
  const expAll = filterExpenses(expenses, { from, to, category: null, scope: null });
  const incAll = filterIncomes(incomes, {
    from,
    to,
    category: null,
    depositAccount: null,
    scope: null,
  });

  const bizExp = expAll.filter((e) => (e.scope ?? "business") === "business");
  const bizInc = incAll.filter((i) => i.scope === "business");
  const perExp = expAll.filter((e) => (e.scope ?? "business") === "personal");
  const perInc = incAll.filter((i) => i.scope === "personal");

  const incomeByDepositAccount: Record<string, { total: number; count: number }> = {};
  for (const i of incAll) {
    const key = i.depositAccount;
    if (!incomeByDepositAccount[key]) {
      incomeByDepositAccount[key] = { total: 0, count: 0 };
    }
    incomeByDepositAccount[key]!.total += i.amount;
    incomeByDepositAccount[key]!.count += 1;
  }

  const businessIncome = sumAmounts(bizInc);
  const businessExpense = sumAmounts(bizExp);

  return {
    range: { from, to },
    business: {
      incomeTotal: businessIncome,
      expenseTotal: businessExpense,
      net: businessIncome - businessExpense,
      incomeCount: bizInc.length,
      expenseCount: bizExp.length,
    },
    personal: {
      incomeTotal: sumAmounts(perInc),
      expenseTotal: sumAmounts(perExp),
      incomeCount: perInc.length,
      expenseCount: perExp.length,
    },
    incomeByDepositAccount,
  };
}
