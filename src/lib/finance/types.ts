export const TRANSACTION_TYPES = ["income", "expense"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/** Palette keys stored in `categories.color`. Each maps to a `--color-cat-*` token. */
export const CATEGORY_COLORS = [
  "clay",
  "ochre",
  "moss",
  "pine",
  "slate",
  "plum",
  "rose",
  "ink",
] as const;
export type CategoryColor = (typeof CATEGORY_COLORS)[number];

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  color: CategoryColor;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  /** Amount in satang (1 baht = 100 satang). Always a positive integer. */
  amountSatang: number;
  description: string;
  /** Business date as `YYYY-MM-DD`, interpreted in Asia/Bangkok. */
  date: string;
  categoryId: string;
  /** ISO timestamp, used only as a stable tie-breaker when sorting. */
  createdAt: string;
}

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

export const TYPE_LABELS: Record<TransactionType, string> = {
  income: "รายรับ",
  expense: "รายจ่าย",
};
