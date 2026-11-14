import { describe, expect, it } from "vitest";

import { CSV_BOM, escapeCsvCell, transactionsToCsv } from "@/lib/finance/csv";
import type { Category, Transaction } from "@/lib/finance/types";
import {
  categoryCreateSchema,
  fieldErrorsOf,
  loginSchema,
  safeNextPath,
  signUpSchema,
  transactionInputSchema,
} from "@/lib/finance/validation";

const validTransaction = {
  id: "7b0e6a52-4b1f-4f0e-9c56-2f6a1d3c8e11",
  type: "expense",
  amount: "1,250.50",
  date: "2026-11-15",
  categoryId: "0f8b9d7e-3c2a-4d1b-8e6f-5a4b3c2d1e0f",
  description: "  ค่าโฮสติ้งเว็บไซต์  ",
};

describe("transactionInputSchema", () => {
  it("accepts valid input, converts the amount to satang and trims text", () => {
    const parsed = transactionInputSchema.parse(validTransaction);
    expect(parsed.amount).toBe(125050);
    expect(parsed.description).toBe("ค่าโฮสติ้งเว็บไซต์");
  });

  it.each([
    [{ amount: "0" }, "amount"],
    [{ amount: "-10" }, "amount"],
    [{ amount: "12.345" }, "amount"],
    [{ amount: "" }, "amount"],
    [{ amount: "abc" }, "amount"],
    [{ date: "2026-02-30" }, "date"],
    [{ date: "1999-12-31" }, "date"],
    [{ date: "15/11/2026" }, "date"],
    [{ type: "transfer" }, "type"],
    [{ categoryId: "" }, "categoryId"],
    [{ categoryId: "not-a-uuid" }, "categoryId"],
    [{ description: "   " }, "description"],
    [{ description: "ก".repeat(201) }, "description"],
    [{ id: "123" }, "id"],
  ])("rejects %j with an error on %s", (patch, field) => {
    const result = transactionInputSchema.safeParse({ ...validTransaction, ...patch });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrorsOf(result.error)).toHaveProperty(field);
  });

  it("rejects non-string and missing fields without throwing", () => {
    expect(transactionInputSchema.safeParse({ ...validTransaction, amount: 1250 }).success).toBe(
      false,
    );
    expect(transactionInputSchema.safeParse(null).success).toBe(false);
    expect(transactionInputSchema.safeParse({}).success).toBe(false);
  });
});

describe("categoryCreateSchema", () => {
  it("accepts a valid category and trims the name", () => {
    expect(
      categoryCreateSchema.parse({ name: " ค่าอบรม ", type: "expense", color: "clay" }),
    ).toEqual({
      name: "ค่าอบรม",
      type: "expense",
      color: "clay",
    });
  });

  it("rejects empty names, long names and colours outside the palette", () => {
    expect(
      categoryCreateSchema.safeParse({ name: "", type: "expense", color: "clay" }).success,
    ).toBe(false);
    expect(
      categoryCreateSchema.safeParse({ name: "ก".repeat(41), type: "expense", color: "clay" })
        .success,
    ).toBe(false);
    expect(
      categoryCreateSchema.safeParse({ name: "x", type: "expense", color: "#ff0000" }).success,
    ).toBe(false);
    expect(
      categoryCreateSchema.safeParse({ name: "x", type: "other", color: "clay" }).success,
    ).toBe(false);
  });
});

describe("auth schemas", () => {
  it("normalises the email and enforces the password length", () => {
    const parsed = signUpSchema.parse({
      displayName: " สตูดิโอ ",
      email: "  Owner@Example.COM ",
      password: "correct-horse",
    });
    expect(parsed).toEqual({
      displayName: "สตูดิโอ",
      email: "owner@example.com",
      password: "correct-horse",
    });
    expect(
      signUpSchema.safeParse({ displayName: "x", email: "a@b.co", password: "short" }).success,
    ).toBe(false);
    expect(
      signUpSchema.safeParse({ displayName: "x", email: "a@b.co", password: "p".repeat(73) })
        .success,
    ).toBe(false);
    expect(
      signUpSchema.safeParse({ displayName: "", email: "a@b.co", password: "longenough" }).success,
    ).toBe(false);
  });

  it("rejects malformed emails", () => {
    for (const email of ["", "plain", "a@", "@b.co", "a b@c.co"]) {
      expect(loginSchema.safeParse({ email, password: "x" }).success).toBe(false);
    }
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("allows paths inside the workspace", () => {
    expect(safeNextPath("/app")).toBe("/app");
    expect(safeNextPath("/app/transactions?type=expense")).toBe("/app/transactions?type=expense");
  });

  it("falls back for anything that could leave the site or the workspace", () => {
    for (const value of [
      null,
      undefined,
      "",
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/app//evil.example",
      "/app/../admin\\x",
      "/application",
      "/login",
      "javascript:alert(1)",
      "/app\n/x",
    ]) {
      expect(safeNextPath(value)).toBe("/app");
    }
  });
});

describe("escapeCsvCell", () => {
  it("leaves plain text alone", () => {
    expect(escapeCsvCell("ค่าเช่า")).toBe("ค่าเช่า");
    expect(escapeCsvCell("")).toBe("");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralises spreadsheet formulas", () => {
    expect(escapeCsvCell("=1+1")).toBe("'=1+1");
    expect(escapeCsvCell("+66812345678")).toBe("'+66812345678");
    expect(escapeCsvCell("-5")).toBe("'-5");
    expect(escapeCsvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(escapeCsvCell("\tcmd")).toBe("'\tcmd");
    expect(escapeCsvCell('=HYPERLINK("http://x","y")')).toBe('"\'=HYPERLINK(""http://x"",""y"")"');
  });
});

describe("transactionsToCsv", () => {
  const categories: Category[] = [
    { id: "c1", name: "ซอฟต์แวร์, เครื่องมือ", type: "expense", color: "pine" },
  ];
  const rows: Transaction[] = [
    {
      id: "t1",
      type: "expense",
      amountSatang: 125050,
      description: '=cmd|"/c calc"!A1',
      date: "2026-11-15",
      categoryId: "c1",
      createdAt: "",
    },
    {
      id: "t2",
      type: "income",
      amountSatang: 3_000_000,
      description: "งานเว็บไซต์",
      date: "2026-11-01",
      categoryId: "missing",
      createdAt: "",
    },
  ];

  it("starts with a BOM, uses CRLF and writes Thai headers", () => {
    const csv = transactionsToCsv(rows, categories);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("วันที่,ประเภท,หมวดหมู่,รายละเอียด,จำนวนเงิน (บาท)");
    expect(lines).toHaveLength(4); // header, two rows, trailing newline
    expect(lines[3]).toBe("");
  });

  it("escapes user text and writes exact decimal amounts", () => {
    const lines = transactionsToCsv(rows, categories).slice(1).split("\r\n");
    expect(lines[1]).toBe('2026-11-15,รายจ่าย,"ซอฟต์แวร์, เครื่องมือ","\'=cmd|""/c calc""!A1",1250.50');
    expect(lines[2]).toBe("2026-11-01,รายรับ,,งานเว็บไซต์,30000.00");
  });

  it("survives a UTF-8 round trip", () => {
    const csv = transactionsToCsv(rows, categories);
    const bytes = new TextEncoder().encode(csv);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes)).toBe(csv);
  });
});
