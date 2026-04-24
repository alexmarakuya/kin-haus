import { describe, expect, it } from "vitest";
import { buildAccountingSummary } from "./accounting-summary.ts";
import type { Expense, Income } from "./types.ts";

describe("buildAccountingSummary", () => {
  const expenses: Expense[] = [
    {
      id: "e1",
      date: "2026-04-01",
      amount: 100,
      currency: "THB",
      vendor: "Shop",
      category: "supplies",
      scope: "business",
      notes: "",
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z",
    },
    {
      id: "e2",
      date: "2026-04-02",
      amount: 50,
      currency: "THB",
      vendor: "Personal",
      category: "food",
      scope: "personal",
      notes: "",
      createdAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z",
    },
  ];

  const incomes: Income[] = [
    {
      id: "i1",
      date: "2026-04-01",
      amount: 500,
      currency: "THB",
      description: "Airbnb",
      category: "airbnb",
      depositAccount: "wise",
      scope: "business",
      notes: "",
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z",
    },
    {
      id: "i2",
      date: "2026-04-03",
      amount: 200,
      currency: "THB",
      description: "Cash guest",
      category: "direct_booking",
      depositAccount: "cash",
      scope: "business",
      notes: "",
      createdAt: "2026-04-03T00:00:00.000Z",
      updatedAt: "2026-04-03T00:00:00.000Z",
    },
  ];

  it("computes business net and deposit breakdown", () => {
    const s = buildAccountingSummary(expenses, incomes, null, null);
    expect(s.business.incomeTotal).toBe(700);
    expect(s.business.expenseTotal).toBe(100);
    expect(s.business.net).toBe(600);
    expect(s.personal.expenseTotal).toBe(50);
    expect(s.incomeByDepositAccount.wise?.total).toBe(500);
    expect(s.incomeByDepositAccount.cash?.total).toBe(200);
  });
});
