import type {
  ActionResult,
  Category,
  CategoryColor,
  Transaction,
  TransactionType,
} from "@/lib/finance/types";
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  fieldErrorsOf,
  transactionInputSchema,
  type TransactionFormValues,
} from "@/lib/finance/validation";

/**
 * The demo workspace's data lives in this in-memory store, inside one browser
 * tab. Nothing is sent anywhere and a reload restores the sample data.
 *
 * It applies the same rules the database enforces for real accounts (same
 * validation schemas, category must match the transaction type, unique names,
 * a category in use cannot be deleted), so the demo behaves like the real app.
 * Its messages always say that nothing was saved.
 */

export interface DemoState {
  categories: Category[];
  transactions: Transaction[];
}

const NOT_SAVED = "ในโหมดตัวอย่าง (ไม่ได้บันทึกลงฐานข้อมูล)";
const invalid = (fieldErrors: Record<string, string>): ActionResult => ({
  ok: false,
  message: "ตรวจสอบข้อมูลที่กรอกอีกครั้ง",
  fieldErrors,
});

const normalise = (name: string) => name.trim().toLocaleLowerCase("th");

export function createDemoStore(initial: DemoState) {
  let state = initial;
  let sequence = 0;
  const listeners = new Set<() => void>();

  const commit = (next: DemoState) => {
    state = next;
    for (const listener of listeners) listener();
  };

  const nameTaken = (name: string, type: TransactionType, exceptId?: string) =>
    state.categories.some(
      (category) =>
        category.type === type &&
        category.id !== exceptId &&
        normalise(category.name) === normalise(name),
    );

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getState: () => state,

    /** Swaps the whole dataset: used to start from an empty account or bring the samples back. */
    replace(next: DemoState) {
      commit(next);
    },

    async saveTransaction(
      values: TransactionFormValues,
      mode: "create" | "update",
    ): Promise<ActionResult> {
      const parsed = transactionInputSchema.safeParse(values);
      if (!parsed.success) return invalid(fieldErrorsOf(parsed.error));
      const input = parsed.data;

      const category = state.categories.find((item) => item.id === input.categoryId);
      if (!category || category.type !== input.type) {
        return invalid({ categoryId: "เลือกหมวดหมู่ที่ตรงกับประเภทรายการ" });
      }

      const existing = state.transactions.find((item) => item.id === input.id);
      if (mode === "update" && !existing) {
        return { ok: false, message: "ไม่พบรายการนี้ อาจถูกลบไปแล้ว" };
      }
      // A repeated submit of the same new form is ignored, as the primary key does for real accounts.
      if (mode === "create" && existing) {
        return { ok: true, message: `เพิ่มรายการ${NOT_SAVED}` };
      }

      sequence += 1;
      const transaction: Transaction = {
        id: input.id,
        type: input.type,
        amountSatang: input.amount,
        description: input.description,
        date: input.date,
        categoryId: input.categoryId,
        createdAt:
          existing?.createdAt ??
          `9999-01-01T00:00:${String(sequence % 60).padStart(2, "0")}.${String(sequence).padStart(3, "0")}Z`,
      };

      commit({
        ...state,
        transactions: existing
          ? state.transactions.map((item) => (item.id === input.id ? transaction : item))
          : [transaction, ...state.transactions],
      });
      return { ok: true, message: `${existing ? "แก้ไข" : "เพิ่ม"}รายการ${NOT_SAVED}` };
    },

    async deleteTransaction(id: string): Promise<ActionResult> {
      commit({ ...state, transactions: state.transactions.filter((item) => item.id !== id) });
      return { ok: true, message: `ลบรายการ${NOT_SAVED}` };
    },

    async createCategory(values: {
      name: string;
      type: TransactionType;
      color: CategoryColor;
    }): Promise<ActionResult> {
      const parsed = categoryCreateSchema.safeParse(values);
      if (!parsed.success) return invalid(fieldErrorsOf(parsed.error));
      if (nameTaken(parsed.data.name, parsed.data.type)) {
        return invalid({ name: "มีหมวดหมู่ชื่อนี้ในประเภทเดียวกันอยู่แล้ว" });
      }
      commit({
        ...state,
        categories: [...state.categories, { id: crypto.randomUUID(), ...parsed.data }],
      });
      return { ok: true, message: `เพิ่มหมวดหมู่${NOT_SAVED}` };
    },

    async updateCategory(values: {
      id: string;
      name: string;
      color: CategoryColor;
    }): Promise<ActionResult> {
      const parsed = categoryUpdateSchema.safeParse(values);
      if (!parsed.success) return invalid(fieldErrorsOf(parsed.error));
      const current = state.categories.find((item) => item.id === parsed.data.id);
      if (!current) return { ok: false, message: "ไม่พบหมวดหมู่นี้ อาจถูกลบไปแล้ว" };
      if (nameTaken(parsed.data.name, current.type, current.id)) {
        return invalid({ name: "มีหมวดหมู่ชื่อนี้ในประเภทเดียวกันอยู่แล้ว" });
      }
      commit({
        ...state,
        categories: state.categories.map((item) =>
          item.id === current.id
            ? { ...item, name: parsed.data.name, color: parsed.data.color }
            : item,
        ),
      });
      return { ok: true, message: `แก้ไขหมวดหมู่${NOT_SAVED}` };
    },

    async deleteCategory(id: string): Promise<ActionResult> {
      if (state.transactions.some((item) => item.categoryId === id)) {
        return {
          ok: false,
          message: "ลบไม่ได้ เพราะยังมีรายการที่ใช้หมวดหมู่นี้ ย้ายรายการไปหมวดอื่นก่อน",
        };
      }
      commit({ ...state, categories: state.categories.filter((item) => item.id !== id) });
      return { ok: true, message: `ลบหมวดหมู่${NOT_SAVED}` };
    },
  };
}

export type DemoStore = ReturnType<typeof createDemoStore>;
