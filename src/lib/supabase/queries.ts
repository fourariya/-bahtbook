import "server-only";

import {
  CATEGORY_COLORS,
  type Category,
  type CategoryColor,
  type Transaction,
} from "@/lib/finance/types";

import type { ServerSupabaseClient } from "./server";

/** PostgREST returns at most 1000 rows per request by default, so rows are read in pages. */
const PAGE_SIZE = 1000;
/** Upper bound on what one workspace loads. See "Demo limitations" in the README. */
const MAX_TRANSACTIONS = 20_000;

function toCategoryColor(value: string): CategoryColor {
  return CATEGORY_COLORS.includes(value as CategoryColor) ? (value as CategoryColor) : "slate";
}

export async function fetchCategories(supabase: ServerSupabaseClient): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, type, color")
    .order("type", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(`Could not load categories (${error.code}).`);

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    color: toCategoryColor(row.color),
  }));
}

/**
 * Loads the signed-in user's transactions, newest first. Row Level Security
 * limits the result to the caller's rows; no user id is passed from the client.
 */
export async function fetchTransactions(supabase: ServerSupabaseClient): Promise<Transaction[]> {
  const transactions: Transaction[] = [];

  for (let offset = 0; offset < MAX_TRANSACTIONS; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("transactions")
      .select("id, type, amount_satang, description, transaction_date, category_id, created_at")
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`Could not load transactions (${error.code}).`);

    for (const row of data) {
      transactions.push({
        id: row.id,
        type: row.type,
        amountSatang: Number(row.amount_satang),
        description: row.description,
        date: row.transaction_date,
        categoryId: row.category_id,
        createdAt: row.created_at,
      });
    }
    if (data.length < PAGE_SIZE) break;
  }

  return transactions;
}

export async function fetchDisplayName(
  supabase: ServerSupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  return data?.display_name ?? null;
}
