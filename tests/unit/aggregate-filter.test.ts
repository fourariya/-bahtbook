import { describe, expect, it } from "vitest";

import {
  categoryTotals,
  formatShare,
  monthlySummary,
  summarize,
  usageByCategory,
} from "@/lib/finance/aggregate";
import {
  DEFAULT_FILTERS,
  filterTransactions,
  filtersToSearchParams,
  hasActiveFilters,
  parseFilters,
  sortTransactions,
} from "@/lib/finance/filter";
import type { Category, Transaction } from "@/lib/finance/types";

const categories: Category[] = [
  { id: "cat-fee", name: "ค่าบริการ", type: "income", color: "moss" },
  { id: "cat-rent", name: "ค่าเช่า", type: "expense", color: "slate" },
  { id: "cat-tools", name: "ซอฟต์แวร์ Tools", type: "expense", color: "pine" },
  { id: "cat-unused", name: "ไม่ได้ใช้", type: "expense", color: "rose" },
];

let counter = 0;
function tx(partial: Partial<Transaction> & Pick<Transaction, "type" | "amountSatang" | "date">) {
  counter += 1;
  return {
    id: `tx-${String(counter).padStart(3, "0")}`,
    description: "รายการทดสอบ",
    categoryId: partial.type === "income" ? "cat-fee" : "cat-rent",
    createdAt: `2026-01-01T00:00:${String(counter).padStart(2, "0")}Z`,
    ...partial,
  } satisfies Transaction;
}

const transactions: Transaction[] = [
  tx({ type: "income", amountSatang: 3_000_000, date: "2026-09-05", description: "งานเว็บไซต์" }),
  tx({ type: "expense", amountSatang: 450_000, date: "2026-09-01" }),
  tx({
    type: "expense",
    amountSatang: 189_050,
    date: "2026-10-05",
    categoryId: "cat-tools",
    description: "Design App รายเดือน",
  }),
  tx({ type: "income", amountSatang: 1_250_025, date: "2026-11-03", description: "งานโลโก้" }),
  tx({ type: "expense", amountSatang: 450_000, date: "2026-11-01" }),
  tx({
    type: "expense",
    amountSatang: 59_050,
    date: "2026-11-08",
    categoryId: "cat-tools",
    description: "ค่าโฮสติ้ง",
  }),
];

describe("summarize", () => {
  it("totals income and expenses and derives the net result", () => {
    expect(summarize(transactions)).toEqual({
      incomeSatang: 4_250_025,
      expenseSatang: 1_148_100,
      netSatang: 3_101_925,
      count: 6,
    });
  });

  it("returns zeros for no transactions", () => {
    expect(summarize([])).toEqual({ incomeSatang: 0, expenseSatang: 0, netSatang: 0, count: 0 });
  });

  it("reports a loss as a negative net", () => {
    const loss = summarize([
      tx({ type: "income", amountSatang: 100, date: "2026-11-01" }),
      tx({ type: "expense", amountSatang: 250, date: "2026-11-02" }),
    ]);
    expect(loss.netSatang).toBe(-150);
  });
});

describe("monthlySummary", () => {
  it("groups by month and fills empty months with zeros", () => {
    const rows = monthlySummary(transactions, ["2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(rows.map((row) => row.month)).toEqual(["2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(rows[0]).toEqual({
      month: "2026-08",
      incomeSatang: 0,
      expenseSatang: 0,
      netSatang: 0,
      count: 0,
    });
    expect(rows[1]).toMatchObject({
      incomeSatang: 3_000_000,
      expenseSatang: 450_000,
      netSatang: 2_550_000,
      count: 2,
    });
    expect(rows[2]).toMatchObject({
      incomeSatang: 0,
      expenseSatang: 189_050,
      netSatang: -189_050,
      count: 1,
    });
    expect(rows[3]).toMatchObject({
      incomeSatang: 1_250_025,
      expenseSatang: 509_050,
      netSatang: 740_975,
      count: 3,
    });
  });

  it("ignores transactions outside the requested months", () => {
    const rows = monthlySummary(transactions, ["2026-11"]);
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(3);
  });

  it("monthly totals add up to the overall summary", () => {
    const rows = monthlySummary(transactions, ["2026-09", "2026-10", "2026-11"]);
    const overall = summarize(transactions);
    expect(rows.reduce((sum, row) => sum + row.incomeSatang, 0)).toBe(overall.incomeSatang);
    expect(rows.reduce((sum, row) => sum + row.expenseSatang, 0)).toBe(overall.expenseSatang);
    expect(rows.reduce((sum, row) => sum + row.netSatang, 0)).toBe(overall.netSatang);
  });
});

describe("categoryTotals", () => {
  it("totals one type per category, largest first, with shares that sum to 1", () => {
    const totals = categoryTotals(transactions, categories, "expense");
    expect(totals.map((total) => [total.name, total.totalSatang, total.count])).toEqual([
      ["ค่าเช่า", 900_000, 2],
      ["ซอฟต์แวร์ Tools", 248_100, 2],
    ]);
    expect(totals.reduce((sum, total) => sum + total.share, 0)).toBeCloseTo(1, 10);
    expect(totals.reduce((sum, total) => sum + total.totalSatang, 0)).toBe(
      summarize(transactions).expenseSatang,
    );
  });

  it("omits unused categories and handles an empty list", () => {
    expect(
      categoryTotals(transactions, categories, "expense").some((t) => t.name === "ไม่ได้ใช้"),
    ).toBe(false);
    expect(categoryTotals([], categories, "expense")).toEqual([]);
  });

  it("keeps a row whose category is missing rather than dropping money", () => {
    const orphan = tx({
      type: "expense",
      amountSatang: 500,
      date: "2026-11-01",
      categoryId: "gone",
    });
    const totals = categoryTotals([orphan], categories, "expense");
    expect(totals).toHaveLength(1);
    expect(totals[0].totalSatang).toBe(500);
  });

  it("counts usage per category", () => {
    const usage = usageByCategory(transactions);
    expect(usage.get("cat-rent")).toBe(2);
    expect(usage.get("cat-fee")).toBe(2);
    expect(usage.get("cat-unused")).toBeUndefined();
  });

  it("formats shares as percentages", () => {
    expect(formatShare(0.5)).toBe("50%");
    expect(formatShare(0.1234)).toBe("12.3%");
  });
});

describe("filterTransactions", () => {
  const base = { query: "", type: "all", categoryId: "all", from: null, to: null } as const;

  it("returns everything with no filters", () => {
    expect(filterTransactions(transactions, base, categories)).toHaveLength(6);
  });

  it("filters by type and category", () => {
    expect(filterTransactions(transactions, { ...base, type: "income" }, categories)).toHaveLength(
      2,
    );
    expect(
      filterTransactions(transactions, { ...base, categoryId: "cat-tools" }, categories),
    ).toHaveLength(2);
  });

  it("filters by an inclusive date range", () => {
    const november = filterTransactions(
      transactions,
      { ...base, from: "2026-11-01", to: "2026-11-30" },
      categories,
    );
    expect(november.map((item) => item.date)).toEqual(["2026-11-03", "2026-11-01", "2026-11-08"]);
    expect(
      filterTransactions(transactions, { ...base, from: "2026-11-08" }, categories),
    ).toHaveLength(1);
    expect(
      filterTransactions(transactions, { ...base, to: "2026-09-01" }, categories),
    ).toHaveLength(1);
  });

  it("searches description, category name and amount, ignoring case", () => {
    expect(filterTransactions(transactions, { ...base, query: "โลโก้" }, categories)).toHaveLength(
      1,
    );
    expect(
      filterTransactions(transactions, { ...base, query: "design app" }, categories),
    ).toHaveLength(1);
    expect(filterTransactions(transactions, { ...base, query: "TOOLS" }, categories)).toHaveLength(
      2,
    );
    expect(filterTransactions(transactions, { ...base, query: "590.50" }, categories)).toHaveLength(
      1,
    );
    expect(filterTransactions(transactions, { ...base, query: "ไม่มีคำนี้" }, categories)).toHaveLength(
      0,
    );
  });

  it("combines filters", () => {
    const result = filterTransactions(
      transactions,
      { query: "ค่า", type: "expense", categoryId: "cat-tools", from: "2026-11-01", to: null },
      categories,
    );
    expect(result.map((item) => item.description)).toEqual(["ค่าโฮสติ้ง"]);
  });
});

describe("sortTransactions", () => {
  it("sorts by date and amount in both directions without mutating the input", () => {
    const original = [...transactions];
    expect(sortTransactions(transactions, "date-desc")[0].date).toBe("2026-11-08");
    expect(sortTransactions(transactions, "date-asc")[0].date).toBe("2026-09-01");
    expect(sortTransactions(transactions, "amount-desc")[0].amountSatang).toBe(3_000_000);
    expect(sortTransactions(transactions, "amount-asc")[0].amountSatang).toBe(59_050);
    expect(transactions).toEqual(original);
  });

  it("breaks ties by newest created first", () => {
    const sameDay = [
      tx({
        type: "expense",
        amountSatang: 100,
        date: "2026-11-10",
        createdAt: "2026-11-10T01:00:00Z",
        description: "first",
      }),
      tx({
        type: "expense",
        amountSatang: 100,
        date: "2026-11-10",
        createdAt: "2026-11-10T02:00:00Z",
        description: "second",
      }),
    ];
    expect(sortTransactions(sameDay, "date-desc").map((item) => item.description)).toEqual([
      "second",
      "first",
    ]);
    expect(sortTransactions(sameDay, "amount-desc").map((item) => item.description)).toEqual([
      "second",
      "first",
    ]);
  });
});

describe("filters in the URL", () => {
  it("round-trips through search params", () => {
    const filters = {
      query: "โฮสติ้ง",
      type: "expense",
      categoryId: "cat-tools",
      from: "2026-11-01",
      to: "2026-11-30",
      sort: "amount-desc",
    } as const;
    expect(parseFilters(filtersToSearchParams(filters))).toEqual(filters);
  });

  it("leaves defaults out of the URL", () => {
    expect(filtersToSearchParams(DEFAULT_FILTERS).toString()).toBe("");
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, sort: "amount-asc" })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, query: " x " })).toBe(true);
  });

  it("ignores malformed values instead of trusting the URL", () => {
    const parsed = parseFilters(
      new URLSearchParams("type=hack&sort=drop&from=2026-02-31&to=nope&q=" + "x".repeat(500)),
    );
    expect(parsed.type).toBe("all");
    expect(parsed.sort).toBe("date-desc");
    expect(parsed.from).toBeNull();
    expect(parsed.to).toBeNull();
    expect(parsed.query).toHaveLength(100);
  });
});
