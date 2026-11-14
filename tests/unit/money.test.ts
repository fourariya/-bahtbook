import { describe, expect, it } from "vitest";

import {
  MAX_AMOUNT_SATANG,
  formatBaht,
  formatBahtCompact,
  parseAmountToSatang,
  satangToDecimalString,
  sumSatang,
} from "@/lib/finance/money";

describe("parseAmountToSatang", () => {
  it.each([
    ["1250", 125000],
    ["1,250.50", 125050],
    ["0.5", 50],
    ["0.05", 5],
    ["  99.99  ", 9999],
    ["฿1,000", 100000],
    ["๑๒๐.๕๐", 12050],
    ["9999999999.99", MAX_AMOUNT_SATANG],
  ])("parses %s", (input, expected) => {
    expect(parseAmountToSatang(input)).toBe(expected);
  });

  it.each([
    ["", "empty"],
    ["0", "zero"],
    ["0.00", "zero with decimals"],
    ["-5", "negative"],
    ["1.234", "three decimals"],
    ["12abc", "letters"],
    ["1e5", "exponent"],
    ["10000000000", "above the maximum"],
    [".5", "no leading digit"],
    ["=1+1", "formula"],
  ])("rejects %s (%s)", (input) => {
    expect(parseAmountToSatang(input)).toBeNull();
  });

  it("does not suffer from binary floating point", () => {
    // 0.1 + 0.2 !== 0.3 in floating point; in satang it is exact.
    const total = parseAmountToSatang("0.10")! + parseAmountToSatang("0.20")!;
    expect(total).toBe(parseAmountToSatang("0.30"));
    expect(parseAmountToSatang("1.15")).toBe(115);
    expect(parseAmountToSatang("4.35")).toBe(435);
  });
});

describe("formatBaht", () => {
  it("formats with grouping and two decimals", () => {
    expect(formatBaht(123456789)).toBe("฿1,234,567.89");
    expect(formatBaht(5)).toBe("฿0.05");
    expect(formatBaht(0)).toBe("฿0.00");
  });

  it("marks negatives with a minus and positives only when asked", () => {
    expect(formatBaht(-125050)).toBe("−฿1,250.50");
    expect(formatBaht(125050, { sign: "always" })).toBe("+฿1,250.50");
    expect(formatBaht(-125050, { sign: "never" })).toBe("฿1,250.50");
    expect(formatBaht(0, { sign: "always" })).toBe("฿0.00");
  });

  it("can drop satang for rounded displays", () => {
    expect(formatBaht(125099, { whole: true })).toBe("฿1,250");
  });

  it("stays exact for the largest allowed amount", () => {
    expect(formatBaht(MAX_AMOUNT_SATANG)).toBe("฿9,999,999,999.99");
  });
});

describe("formatBahtCompact", () => {
  it("abbreviates for chart axes", () => {
    expect(formatBahtCompact(4_500_000)).toBe("฿45K");
    expect(formatBahtCompact(-150_000_000)).toBe("−฿1.5M");
    expect(formatBahtCompact(0)).toBe("฿0");
  });
});

describe("satangToDecimalString", () => {
  it("round-trips through the parser", () => {
    for (const satang of [1, 50, 99, 100, 125050, MAX_AMOUNT_SATANG]) {
      expect(parseAmountToSatang(satangToDecimalString(satang))).toBe(satang);
    }
    expect(satangToDecimalString(5)).toBe("0.05");
    expect(satangToDecimalString(-125050)).toBe("-1250.50");
  });
});

describe("sumSatang", () => {
  it("adds integers exactly", () => {
    expect(sumSatang([10, 20, 30])).toBe(60);
    expect(sumSatang([])).toBe(0);
    expect(sumSatang(Array.from({ length: 1000 }, () => 10))).toBe(10_000);
  });
});
