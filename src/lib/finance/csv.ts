import { satangToDecimalString } from "./money";
import { TYPE_LABELS, type Category, type Transaction } from "./types";

/** UTF-8 byte order mark, so Excel opens Thai text correctly. */
export const CSV_BOM = "﻿";

/**
 * Escapes one CSV cell.
 *
 * Text that a spreadsheet would treat as a formula (leading `=`, `+`, `-`, `@`,
 * tab or carriage return) is prefixed with an apostrophe so it is shown as
 * text instead of being evaluated (CSV / formula injection).
 */
export function escapeCsvCell(value: string): string {
  const neutralised = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(neutralised) ? `"${neutralised.replace(/"/g, '""')}"` : neutralised;
}

export const CSV_HEADERS = ["วันที่", "ประเภท", "หมวดหมู่", "รายละเอียด", "จำนวนเงิน (บาท)"];

/** Builds a CSV document (with BOM, CRLF line endings) from the given transactions. */
export function transactionsToCsv(
  transactions: readonly Transaction[],
  categories: readonly Category[],
): string {
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));

  const rows = transactions.map((transaction) =>
    [
      transaction.date,
      TYPE_LABELS[transaction.type],
      categoryNames.get(transaction.categoryId) ?? "",
      transaction.description,
      // Always a positive decimal such as 1250.00, never user-controlled text.
      satangToDecimalString(transaction.amountSatang),
    ]
      .map(escapeCsvCell)
      .join(","),
  );

  return CSV_BOM + [CSV_HEADERS.map(escapeCsvCell).join(","), ...rows].join("\r\n") + "\r\n";
}
