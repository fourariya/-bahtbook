import { isInRange, isValidDateString } from "./dates";
import { satangToDecimalString } from "./money";
import type { Category, Transaction, TransactionType } from "./types";

export const SORT_KEYS = ["date-desc", "date-asc", "amount-desc", "amount-asc"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const SORT_LABELS: Record<SortKey, string> = {
  "date-desc": "วันที่ ใหม่ไปเก่า",
  "date-asc": "วันที่ เก่าไปใหม่",
  "amount-desc": "จำนวนเงิน มากไปน้อย",
  "amount-asc": "จำนวนเงิน น้อยไปมาก",
};

export interface TransactionFilters {
  query: string;
  type: TransactionType | "all";
  categoryId: string | "all";
  from: string | null;
  to: string | null;
  sort: SortKey;
}

export const DEFAULT_FILTERS: TransactionFilters = {
  query: "",
  type: "all",
  categoryId: "all",
  from: null,
  to: null,
  sort: "date-desc",
};

export function hasActiveFilters(filters: TransactionFilters): boolean {
  return (
    filters.query.trim() !== "" ||
    filters.type !== "all" ||
    filters.categoryId !== "all" ||
    filters.from !== null ||
    filters.to !== null
  );
}

/** Reads filters from URL search params, ignoring anything malformed. */
export function parseFilters(params: URLSearchParams): TransactionFilters {
  const type = params.get("type");
  const sort = params.get("sort");
  const from = params.get("from");
  const to = params.get("to");
  return {
    query: (params.get("q") ?? "").slice(0, 100),
    type: type === "income" || type === "expense" ? type : "all",
    categoryId: params.get("category") || "all",
    from: from && isValidDateString(from) ? from : null,
    to: to && isValidDateString(to) ? to : null,
    sort: SORT_KEYS.includes(sort as SortKey) ? (sort as SortKey) : "date-desc",
  };
}

/** Serialises filters back to search params, leaving defaults out of the URL. */
export function filtersToSearchParams(filters: TransactionFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query.trim()) params.set("q", filters.query.trim());
  if (filters.type !== "all") params.set("type", filters.type);
  if (filters.categoryId !== "all") params.set("category", filters.categoryId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.sort !== "date-desc") params.set("sort", filters.sort);
  return params;
}

export function filterTransactions(
  transactions: readonly Transaction[],
  filters: Omit<TransactionFilters, "sort">,
  categories: readonly Category[],
): Transaction[] {
  const needle = filters.query.trim().toLocaleLowerCase("th");
  const categoryNames = new Map(
    categories.map((category) => [category.id, category.name.toLocaleLowerCase("th")]),
  );
  const range = { from: filters.from, to: filters.to };

  return transactions.filter((transaction) => {
    if (filters.type !== "all" && transaction.type !== filters.type) return false;
    if (filters.categoryId !== "all" && transaction.categoryId !== filters.categoryId) return false;
    if (!isInRange(transaction.date, range)) return false;
    if (!needle) return true;
    return (
      transaction.description.toLocaleLowerCase("th").includes(needle) ||
      (categoryNames.get(transaction.categoryId) ?? "").includes(needle) ||
      satangToDecimalString(transaction.amountSatang).includes(needle.replace(/,/g, ""))
    );
  });
}

export function sortTransactions(
  transactions: readonly Transaction[],
  sort: SortKey,
): Transaction[] {
  const newestFirst = (a: Transaction, b: Transaction) =>
    b.date.localeCompare(a.date) ||
    b.createdAt.localeCompare(a.createdAt) ||
    b.id.localeCompare(a.id);

  return [...transactions].sort((a, b) => {
    switch (sort) {
      case "date-desc":
        return newestFirst(a, b);
      case "date-asc":
        return -newestFirst(a, b);
      case "amount-desc":
        return b.amountSatang - a.amountSatang || newestFirst(a, b);
      case "amount-asc":
        return a.amountSatang - b.amountSatang || newestFirst(a, b);
    }
  });
}
