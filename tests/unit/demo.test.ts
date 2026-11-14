import { describe, expect, it } from "vitest";

import { buildDemoCategories, buildDemoTransactions } from "@/lib/demo/data";
import { createDemoStore } from "@/lib/demo/store";
import { summarize } from "@/lib/finance/aggregate";
import { monthKeyOf } from "@/lib/finance/dates";
import { idSchema } from "@/lib/finance/validation";

const TODAY = "2026-11-15";

function freshStore() {
  const categories = buildDemoCategories();
  return createDemoStore({ categories, transactions: buildDemoTransactions(TODAY, categories) });
}

describe("demo data", () => {
  const categories = buildDemoCategories();
  const transactions = buildDemoTransactions(TODAY, categories);

  it("is deterministic", () => {
    expect(buildDemoTransactions(TODAY, buildDemoCategories())).toEqual(transactions);
  });

  it("covers the six months ending today and never the future", () => {
    const months = new Set(transactions.map((transaction) => monthKeyOf(transaction.date)));
    expect([...months].sort()).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
    expect(transactions.every((transaction) => transaction.date <= TODAY)).toBe(true);
  });

  it("only produces rows the real schema would accept", () => {
    const byId = new Map(categories.map((category) => [category.id, category]));
    for (const transaction of transactions) {
      expect(idSchema.safeParse(transaction.id).success).toBe(true);
      expect(Number.isInteger(transaction.amountSatang) && transaction.amountSatang > 0).toBe(true);
      expect(byId.get(transaction.categoryId)?.type).toBe(transaction.type);
    }
    expect(new Set(transactions.map((transaction) => transaction.id)).size).toBe(
      transactions.length,
    );
  });

  it("works on the first and last day of a month and in a leap February", () => {
    for (const day of ["2026-03-01", "2026-03-31", "2028-02-29"]) {
      const rows = buildDemoTransactions(day, categories);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.date <= day)).toBe(true);
    }
  });
});

describe("demo store", () => {
  const newTransaction = (store: ReturnType<typeof freshStore>, patch = {}) => ({
    id: "7b0e6a52-4b1f-4f0e-9c56-2f6a1d3c8e11",
    type: "expense" as const,
    amount: "999.99",
    date: TODAY,
    categoryId: store.getState().categories.find((category) => category.type === "expense")!.id,
    description: "รายการทดสอบ",
    ...patch,
  });

  it("adds a transaction and the totals follow", async () => {
    const store = freshStore();
    const before = summarize(store.getState().transactions);
    const result = await store.saveTransaction(newTransaction(store), "create");
    expect(result.ok).toBe(true);
    expect(result.message).toContain("ไม่ได้บันทึกลงฐานข้อมูล");
    const after = summarize(store.getState().transactions);
    expect(after.expenseSatang).toBe(before.expenseSatang + 99_999);
    expect(after.count).toBe(before.count + 1);
  });

  it("ignores a repeated submit of the same form", async () => {
    const store = freshStore();
    const values = newTransaction(store);
    await store.saveTransaction(values, "create");
    const count = store.getState().transactions.length;
    expect((await store.saveTransaction(values, "create")).ok).toBe(true);
    expect(store.getState().transactions).toHaveLength(count);
  });

  it("edits and deletes", async () => {
    const store = freshStore();
    const values = newTransaction(store);
    await store.saveTransaction(values, "create");
    await store.saveTransaction({ ...values, amount: "1,500" }, "update");
    expect(store.getState().transactions.find((item) => item.id === values.id)?.amountSatang).toBe(
      150_000,
    );
    await store.deleteTransaction(values.id);
    expect(store.getState().transactions.some((item) => item.id === values.id)).toBe(false);
  });

  it("rejects invalid input and a category of the wrong type", async () => {
    const store = freshStore();
    const invalid = await store.saveTransaction(newTransaction(store, { amount: "0" }), "create");
    expect(invalid).toMatchObject({ ok: false, fieldErrors: { amount: expect.any(String) } });

    const incomeCategory = store
      .getState()
      .categories.find((category) => category.type === "income")!;
    const mismatch = await store.saveTransaction(
      newTransaction(store, { categoryId: incomeCategory.id }),
      "create",
    );
    expect(mismatch).toMatchObject({ ok: false, fieldErrors: { categoryId: expect.any(String) } });
  });

  it("enforces unique category names per type and protects categories in use", async () => {
    const store = freshStore();
    const used = store.getState().categories.find((category) => category.name === "ค่าเช่าและสถานที่")!;

    expect(
      (await store.createCategory({ name: " ค่าเช่าและสถานที่ ", type: "expense", color: "clay" })).ok,
    ).toBe(false);
    expect(
      (await store.createCategory({ name: "ค่าเช่าและสถานที่", type: "income", color: "clay" })).ok,
    ).toBe(true);
    expect((await store.deleteCategory(used.id)).ok).toBe(false);
    expect(store.getState().categories.some((category) => category.id === used.id)).toBe(true);

    await store.createCategory({ name: "ค่าอบรม", type: "expense", color: "moss" });
    const created = store.getState().categories.find((category) => category.name === "ค่าอบรม")!;
    expect(
      (await store.updateCategory({ id: created.id, name: "ค่าอบรมและสัมมนา", color: "plum" })).ok,
    ).toBe(true);
    expect((await store.deleteCategory(created.id)).ok).toBe(true);
  });

  it("notifies subscribers", async () => {
    const store = freshStore();
    let calls = 0;
    const unsubscribe = store.subscribe(() => (calls += 1));
    await store.saveTransaction(newTransaction(store), "create");
    unsubscribe();
    await store.deleteTransaction("7b0e6a52-4b1f-4f0e-9c56-2f6a1d3c8e11");
    expect(calls).toBe(1);
  });
});
