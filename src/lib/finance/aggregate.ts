import { monthKeyOf } from "./dates";
import type { Category, CategoryColor, Transaction, TransactionType } from "./types";

export interface Summary {
  incomeSatang: number;
  expenseSatang: number;
  /** income − expense. Negative when the period ran at a loss. */
  netSatang: number;
  count: number;
}

export function summarize(transactions: readonly Transaction[]): Summary {
  let incomeSatang = 0;
  let expenseSatang = 0;
  for (const transaction of transactions) {
    if (transaction.type === "income") incomeSatang += transaction.amountSatang;
    else expenseSatang += transaction.amountSatang;
  }
  return {
    incomeSatang,
    expenseSatang,
    netSatang: incomeSatang - expenseSatang,
    count: transactions.length,
  };
}

export interface MonthlySummary extends Summary {
  /** `YYYY-MM` */
  month: string;
}

/**
 * One row per requested month, in the order given. Months without transactions
 * are returned with zero totals so charts keep an honest, continuous axis.
 */
export function monthlySummary(
  transactions: readonly Transaction[],
  months: readonly string[],
): MonthlySummary[] {
  const rows = new Map<string, MonthlySummary>(
    months.map((month) => [
      month,
      { month, incomeSatang: 0, expenseSatang: 0, netSatang: 0, count: 0 },
    ]),
  );

  for (const transaction of transactions) {
    const row = rows.get(monthKeyOf(transaction.date));
    if (!row) continue;
    if (transaction.type === "income") row.incomeSatang += transaction.amountSatang;
    else row.expenseSatang += transaction.amountSatang;
    row.netSatang = row.incomeSatang - row.expenseSatang;
    row.count += 1;
  }

  return months.map((month) => rows.get(month)!);
}

export interface CategoryTotal {
  categoryId: string;
  name: string;
  color: CategoryColor;
  totalSatang: number;
  count: number;
  /** Fraction of the grand total, 0 to 1. Display only. */
  share: number;
}

/** Totals per category for one transaction type, largest first. Unused categories are omitted. */
export function categoryTotals(
  transactions: readonly Transaction[],
  categories: readonly Category[],
  type: TransactionType,
): CategoryTotal[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const totals = new Map<string, { totalSatang: number; count: number }>();
  let grandTotal = 0;

  for (const transaction of transactions) {
    if (transaction.type !== type) continue;
    const entry = totals.get(transaction.categoryId) ?? { totalSatang: 0, count: 0 };
    entry.totalSatang += transaction.amountSatang;
    entry.count += 1;
    totals.set(transaction.categoryId, entry);
    grandTotal += transaction.amountSatang;
  }

  return [...totals.entries()]
    .map(([categoryId, entry]) => {
      const category = byId.get(categoryId);
      return {
        categoryId,
        name: category?.name ?? "ไม่ทราบหมวดหมู่",
        color: category?.color ?? "slate",
        totalSatang: entry.totalSatang,
        count: entry.count,
        share: grandTotal === 0 ? 0 : entry.totalSatang / grandTotal,
      };
    })
    .sort((a, b) => b.totalSatang - a.totalSatang || a.name.localeCompare(b.name, "th"));
}

/** How many transactions reference each category id. */
export function usageByCategory(transactions: readonly Transaction[]): Map<string, number> {
  const usage = new Map<string, number>();
  for (const transaction of transactions) {
    usage.set(transaction.categoryId, (usage.get(transaction.categoryId) ?? 0) + 1);
  }
  return usage;
}

const percentFormat = new Intl.NumberFormat("th-TH", {
  style: "percent",
  maximumFractionDigits: 1,
  numberingSystem: "latn",
});

export function formatShare(share: number): string {
  return percentFormat.format(share);
}
