/**
 * Money is handled as integer satang everywhere (1 baht = 100 satang).
 * Nothing in this module does arithmetic on fractional baht values.
 */

/** Largest amount a single transaction may hold: ฿9,999,999,999.99. */
export const MAX_AMOUNT_SATANG = 999_999_999_999;

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";

const groupFormat = new Intl.NumberFormat("th-TH", {
  maximumFractionDigits: 0,
  numberingSystem: "latn",
});

/**
 * Parses what a person types into an amount field ("1,250", "1250.5", "๑๒๐.๕๐")
 * into satang. Returns null for anything that is not a positive amount with at
 * most two decimal places within the allowed range.
 */
export function parseAmountToSatang(input: string): number | null {
  const normalised = input
    .trim()
    .replace(/[๐-๙]/g, (digit) => String(THAI_DIGITS.indexOf(digit)))
    .replace(/[฿\s]/g, "")
    .replace(/,/g, "");

  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(normalised);
  if (!match) return null;

  const baht = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const satang = baht * 100 + fraction;

  if (!Number.isSafeInteger(satang) || satang <= 0 || satang > MAX_AMOUNT_SATANG) return null;
  return satang;
}

/** "123450" → "1234.50". Plain decimal string for form fields and CSV. */
export function satangToDecimalString(satang: number): string {
  const sign = satang < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(satang));
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export interface FormatBahtOptions {
  /** "always" prefixes + or −, "negative" only marks negatives, "never" drops the sign. */
  sign?: "always" | "negative" | "never";
  /** Drop the satang part. Only for axis ticks and other rounded displays. */
  whole?: boolean;
}

/** Formats satang as Thai baht, e.g. `฿12,450.00`. */
export function formatBaht(satang: number, options: FormatBahtOptions = {}): string {
  const { sign = "negative", whole = false } = options;
  const value = Math.trunc(satang);
  const abs = Math.abs(value);
  const baht = groupFormat.format(Math.trunc(abs / 100));
  const body = whole ? `฿${baht}` : `฿${baht}.${String(abs % 100).padStart(2, "0")}`;

  if (sign === "never" || value === 0) return body;
  if (value < 0) return `−${body}`;
  return sign === "always" ? `+${body}` : body;
}

const compactFormat = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Rounded label for chart axes, e.g. `฿45K`. Never used for totals. */
export function formatBahtCompact(satang: number): string {
  const sign = satang < 0 ? "−" : "";
  return `${sign}฿${compactFormat.format(Math.abs(satang) / 100)}`;
}

export function sumSatang(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}
