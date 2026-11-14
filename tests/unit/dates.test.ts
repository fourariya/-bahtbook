import { describe, expect, it } from "vitest";

import {
  addMonths,
  describeRange,
  formatThaiDate,
  formatThaiMonthLong,
  formatThaiMonthShort,
  isDateInAllowedRange,
  isInRange,
  isPeriodKey,
  isValidDateString,
  lastMonths,
  listMonths,
  monthKeyOf,
  monthRange,
  resolvePeriod,
  todayInBangkok,
} from "@/lib/finance/dates";

describe("todayInBangkok", () => {
  it("uses Asia/Bangkok, not UTC or the machine's timezone", () => {
    // 17:30 UTC is already 00:30 the next day in Bangkok (UTC+7).
    expect(todayInBangkok(new Date("2026-11-14T17:30:00Z"))).toBe("2026-11-15");
    expect(todayInBangkok(new Date("2026-11-14T16:59:59Z"))).toBe("2026-11-14");
    expect(todayInBangkok(new Date("2026-12-31T17:00:00Z"))).toBe("2027-01-01");
  });
});

describe("isValidDateString", () => {
  it("accepts real calendar dates", () => {
    expect(isValidDateString("2026-11-15")).toBe(true);
    expect(isValidDateString("2028-02-29")).toBe(true);
  });

  it("rejects impossible or malformed dates", () => {
    for (const value of ["2026-02-30", "2027-02-29", "2026-13-01", "2026-1-5", "15/11/2026", ""]) {
      expect(isValidDateString(value)).toBe(false);
    }
  });

  it("limits dates to the range the database accepts", () => {
    expect(isDateInAllowedRange("2000-01-01")).toBe(true);
    expect(isDateInAllowedRange("1999-12-31")).toBe(false);
    expect(isDateInAllowedRange("2101-01-01")).toBe(false);
  });
});

describe("month arithmetic", () => {
  it("adds and subtracts months across year boundaries", () => {
    expect(addMonths("2026-11", 1)).toBe("2026-12");
    expect(addMonths("2026-11", 2)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-03", -15)).toBe("2024-12");
  });

  it("knows month lengths, including leap years", () => {
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthRange("2026-11")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
  });

  it("lists months inclusively, oldest first", () => {
    expect(listMonths("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(listMonths("2026-11", "2026-10")).toEqual([]);
    expect(lastMonths("2026-02-10", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(monthKeyOf("2026-11-15")).toBe("2026-11");
  });
});

describe("resolvePeriod", () => {
  const today = "2026-11-15";

  it("resolves each preset to an inclusive range", () => {
    expect(resolvePeriod("this-month", today)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(resolvePeriod("last-month", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(resolvePeriod("last-3-months", today)).toEqual({ from: "2026-09-01", to: "2026-11-30" });
    expect(resolvePeriod("this-year", today)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(resolvePeriod("all", today)).toEqual({ from: null, to: null });
  });

  it("handles January", () => {
    expect(resolvePeriod("last-month", "2027-01-05")).toEqual({
      from: "2026-12-01",
      to: "2026-12-31",
    });
    expect(resolvePeriod("last-3-months", "2027-01-05").from).toBe("2026-11-01");
  });

  it("validates period keys from the URL", () => {
    expect(isPeriodKey("this-month")).toBe(true);
    expect(isPeriodKey("yesterday")).toBe(false);
    expect(isPeriodKey(null)).toBe(false);
  });
});

describe("isInRange", () => {
  it("includes both ends and treats null as open", () => {
    const range = { from: "2026-11-01", to: "2026-11-30" };
    expect(isInRange("2026-11-01", range)).toBe(true);
    expect(isInRange("2026-11-30", range)).toBe(true);
    expect(isInRange("2026-10-31", range)).toBe(false);
    expect(isInRange("2026-12-01", range)).toBe(false);
    expect(isInRange("1999-01-01", { from: null, to: null })).toBe(true);
    expect(isInRange("2026-12-01", { from: "2026-11-01", to: null })).toBe(true);
  });
});

describe("Thai formatting", () => {
  it("shows dates in the Buddhist era with Latin digits", () => {
    expect(formatThaiDate("2026-11-15")).toBe("15 พ.ย. 2569");
    expect(formatThaiDate("2026-01-01")).toBe("1 ม.ค. 2569");
  });

  it("formats months", () => {
    expect(formatThaiMonthShort("2026-11")).toBe("พ.ย. 69");
    expect(formatThaiMonthLong("2026-11")).toBe("พฤศจิกายน 2569");
  });

  it("describes ranges", () => {
    expect(describeRange({ from: "2026-11-01", to: "2026-11-30" })).toBe(
      "1 พ.ย. 2569 ถึง 30 พ.ย. 2569",
    );
    expect(describeRange({ from: null, to: null })).toBe("ทุกช่วงเวลา");
  });
});
