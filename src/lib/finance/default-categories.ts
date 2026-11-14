import type { CategoryColor, TransactionType } from "./types";

export interface DefaultCategory {
  name: string;
  type: TransactionType;
  color: CategoryColor;
}

/**
 * Categories every new account starts with.
 *
 * The database creates these rows itself (see `handle_new_user` in
 * `supabase/migrations`). This list is used by the demo workspace, and an
 * integration test asserts that the two stay identical.
 */
export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { name: "ค่าบริการและงานโปรเจกต์", type: "income", color: "moss" },
  { name: "ขายสินค้า", type: "income", color: "ochre" },
  { name: "รายรับอื่น ๆ", type: "income", color: "slate" },
  { name: "ค่าเช่าและสถานที่", type: "expense", color: "slate" },
  { name: "ซอฟต์แวร์และเครื่องมือ", type: "expense", color: "pine" },
  { name: "การตลาดและโฆษณา", type: "expense", color: "clay" },
  { name: "เดินทางและขนส่ง", type: "expense", color: "ochre" },
  { name: "อุปกรณ์สำนักงาน", type: "expense", color: "moss" },
  { name: "ค่าจ้างและผู้รับเหมา", type: "expense", color: "plum" },
  { name: "ภาษีและค่าธรรมเนียม", type: "expense", color: "ink" },
  { name: "รายจ่ายอื่น ๆ", type: "expense", color: "rose" },
];
