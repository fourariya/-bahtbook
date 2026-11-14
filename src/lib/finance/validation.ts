import { z } from "zod";

import { MAX_DATE, MIN_DATE, isValidDateString } from "./dates";
import { parseAmountToSatang } from "./money";
import { CATEGORY_COLORS, TRANSACTION_TYPES } from "./types";

export const DESCRIPTION_MAX = 200;
export const CATEGORY_NAME_MAX = 40;
export const DISPLAY_NAME_MAX = 60;
export const PASSWORD_MIN = 8;
/** bcrypt, which Supabase Auth uses, only reads the first 72 bytes. */
export const PASSWORD_MAX = 72;

const typeSchema = z.enum(TRANSACTION_TYPES, { error: "เลือกประเภทรายการ" });

export const transactionInputSchema = z.object({
  id: z.uuid({ error: "รหัสรายการไม่ถูกต้อง" }),
  type: typeSchema,
  amount: z
    .string({ error: "กรอกจำนวนเงิน" })
    .trim()
    .min(1, "กรอกจำนวนเงิน")
    .transform((value, context) => {
      const satang = parseAmountToSatang(value);
      if (satang === null) {
        context.addIssue({
          code: "custom",
          message: "จำนวนเงินต้องมากกว่า 0 และมีทศนิยมไม่เกิน 2 ตำแหน่ง เช่น 1250.50",
        });
        return z.NEVER;
      }
      return satang;
    }),
  date: z
    .string({ error: "เลือกวันที่" })
    .refine(isValidDateString, "วันที่ไม่ถูกต้อง")
    .refine((value) => value >= MIN_DATE && value <= MAX_DATE, "วันที่ต้องอยู่ระหว่างปี 2000 ถึง 2100"),
  categoryId: z.uuid({ error: "เลือกหมวดหมู่" }),
  description: z
    .string({ error: "กรอกรายละเอียด" })
    .trim()
    .min(1, "กรอกรายละเอียดของรายการ")
    .max(DESCRIPTION_MAX, `รายละเอียดยาวได้ไม่เกิน ${DESCRIPTION_MAX} ตัวอักษร`),
});

/** Raw form values, before validation. */
export type TransactionFormValues = z.input<typeof transactionInputSchema>;
/** Validated values. `amount` is satang. */
export type TransactionInput = z.output<typeof transactionInputSchema>;

const categoryNameSchema = z
  .string({ error: "กรอกชื่อหมวดหมู่" })
  .trim()
  .min(1, "กรอกชื่อหมวดหมู่")
  .max(CATEGORY_NAME_MAX, `ชื่อหมวดหมู่ยาวได้ไม่เกิน ${CATEGORY_NAME_MAX} ตัวอักษร`);

const categoryColorSchema = z.enum(CATEGORY_COLORS, { error: "เลือกสีของหมวดหมู่" });

export const categoryCreateSchema = z.object({
  name: categoryNameSchema,
  type: typeSchema,
  color: categoryColorSchema,
});
export type CategoryCreateInput = z.output<typeof categoryCreateSchema>;

export const categoryUpdateSchema = z.object({
  id: z.uuid({ error: "รหัสหมวดหมู่ไม่ถูกต้อง" }),
  name: categoryNameSchema,
  color: categoryColorSchema,
});
export type CategoryUpdateInput = z.output<typeof categoryUpdateSchema>;

export const idSchema = z.uuid({ error: "รหัสไม่ถูกต้อง" });

const emailSchema = z
  .string({ error: "กรอกอีเมล" })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "รูปแบบอีเมลไม่ถูกต้อง เช่น name@example.com" }).max(254));

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: "กรอกรหัสผ่าน" }).min(1, "กรอกรหัสผ่าน").max(PASSWORD_MAX),
});

export const signUpSchema = z.object({
  displayName: z
    .string({ error: "กรอกชื่อที่ใช้แสดง" })
    .trim()
    .min(1, "กรอกชื่อที่ใช้แสดง")
    .max(DISPLAY_NAME_MAX, `ชื่อยาวได้ไม่เกิน ${DISPLAY_NAME_MAX} ตัวอักษร`),
  email: emailSchema,
  password: z
    .string({ error: "กรอกรหัสผ่าน" })
    .min(PASSWORD_MIN, `รหัสผ่านต้องยาวอย่างน้อย ${PASSWORD_MIN} ตัวอักษร`)
    .max(PASSWORD_MAX, `รหัสผ่านยาวได้ไม่เกิน ${PASSWORD_MAX} ตัวอักษร`),
});

/** Flattens zod issues into one message per top-level field (first issue wins). */
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in errors)) errors[key] = issue.message;
  }
  return errors;
}

/**
 * Only same-site paths inside the workspace are accepted as a post-login
 * destination. Anything else falls back to the dashboard (open-redirect guard).
 */
export function safeNextPath(next: string | null | undefined, fallback = "/app"): string {
  if (!next) return fallback;
  if (!/^\/app(?:[/?#]|$)/.test(next)) return fallback;
  if (next.includes("\\") || next.includes("//") || /[\u0000-\u001f]/.test(next)) return fallback;
  return next;
}
