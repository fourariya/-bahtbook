/**
 * Business dates are plain `YYYY-MM-DD` strings interpreted in Asia/Bangkok.
 * They are compared as strings and never converted through the local timezone
 * of the server or the browser.
 */

export const BUSINESS_TIME_ZONE = "Asia/Bangkok";
export const MIN_DATE = "2000-01-01";
export const MAX_DATE = "2100-12-31";

const bangkokDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in Bangkok as `YYYY-MM-DD`. */
export function todayInBangkok(now: Date = new Date()): string {
  return bangkokDateFormat.format(now);
}

export function isValidDateString(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function isDateInAllowedRange(value: string): boolean {
  return isValidDateString(value) && value >= MIN_DATE && value <= MAX_DATE;
}

/** "2026-11-15" → "2026-11" */
export function monthKeyOf(date: string): string {
  return date.slice(0, 7);
}

export function addMonths(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const index = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}`;
}

export function monthRange(monthKey: string): { from: string; to: string } {
  const [year, month] = monthKey.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${monthKey}-01`, to: `${monthKey}-${String(lastDay).padStart(2, "0")}` };
}

/** Inclusive list of month keys, oldest first. */
export function listMonths(fromKey: string, toKey: string): string[] {
  const months: string[] = [];
  for (let key = fromKey; key <= toKey && months.length < 600; key = addMonths(key, 1)) {
    months.push(key);
  }
  return months;
}

/** The last `count` months ending with the month of `today`, oldest first. */
export function lastMonths(today: string, count: number): string[] {
  const end = monthKeyOf(today);
  return listMonths(addMonths(end, -(count - 1)), end);
}

export const PERIOD_KEYS = [
  "this-month",
  "last-month",
  "last-3-months",
  "this-year",
  "all",
] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  "this-month": "เดือนนี้",
  "last-month": "เดือนที่แล้ว",
  "last-3-months": "3 เดือนล่าสุด",
  "this-year": "ปีนี้",
  all: "ทั้งหมด",
};

export function isPeriodKey(value: string | null | undefined): value is PeriodKey {
  return PERIOD_KEYS.includes(value as PeriodKey);
}

export interface DateRange {
  /** Inclusive start, or null for no lower bound. */
  from: string | null;
  /** Inclusive end, or null for no upper bound. */
  to: string | null;
}

/** Resolves a preset period to an inclusive date range relative to `today` (Bangkok). */
export function resolvePeriod(period: PeriodKey, today: string): DateRange {
  const thisMonth = monthKeyOf(today);
  switch (period) {
    case "this-month":
      return monthRange(thisMonth);
    case "last-month":
      return monthRange(addMonths(thisMonth, -1));
    case "last-3-months":
      return { from: `${addMonths(thisMonth, -2)}-01`, to: monthRange(thisMonth).to };
    case "this-year":
      return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
    case "all":
      return { from: null, to: null };
  }
}

export function isInRange(date: string, range: DateRange): boolean {
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

function toUtcDate(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

const thaiDateFormat = new Intl.DateTimeFormat("th-TH-u-ca-buddhist-nu-latn", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const thaiMonthShortFormat = new Intl.DateTimeFormat("th-TH-u-ca-buddhist-nu-latn", {
  timeZone: "UTC",
  month: "short",
  year: "2-digit",
});

const thaiMonthLongFormat = new Intl.DateTimeFormat("th-TH-u-ca-buddhist-nu-latn", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

/** "2026-11-15" → "15 พ.ย. 2569" (Buddhist era, as Thai users expect). */
export function formatThaiDate(date: string): string {
  return thaiDateFormat.format(toUtcDate(date));
}

/** "2026-11" → "พ.ย. 69" */
export function formatThaiMonthShort(monthKey: string): string {
  return thaiMonthShortFormat.format(toUtcDate(`${monthKey}-01`));
}

/** "2026-11" → "พฤศจิกายน 2569" */
export function formatThaiMonthLong(monthKey: string): string {
  return thaiMonthLongFormat.format(toUtcDate(`${monthKey}-01`));
}

/** Human description of a range, e.g. "1 พ.ย. 2569 ถึง 30 พ.ย. 2569". */
export function describeRange(range: DateRange): string {
  if (range.from && range.to) return `${formatThaiDate(range.from)} ถึง ${formatThaiDate(range.to)}`;
  if (range.from) return `ตั้งแต่ ${formatThaiDate(range.from)}`;
  if (range.to) return `ถึง ${formatThaiDate(range.to)}`;
  return "ทุกช่วงเวลา";
}
