import { addMonths, monthKeyOf, monthRange } from "@/lib/finance/dates";
import { DEFAULT_CATEGORIES } from "@/lib/finance/default-categories";
import type { Category, Transaction, TransactionType } from "@/lib/finance/types";

/**
 * Sample data for the public demo. Everything here is fictional: a made-up
 * one-person design studio, made-up clients, made-up amounts. It is generated
 * relative to today's date so the demo always shows a current six months, and
 * it is deterministic, so every visitor (and every test run) sees the same rows.
 */

export const DEMO_DISPLAY_NAME = "สตูดิโอออกแบบตัวอย่าง (ข้อมูลสมมติ)";

const uuid = (prefix: string, index: number) =>
  `${prefix}-0000-4000-8000-${String(index).padStart(12, "0")}`;

export function buildDemoCategories(): Category[] {
  return DEFAULT_CATEGORIES.map((category, index) => ({
    id: uuid("c0000000", index + 1),
    ...category,
  }));
}

interface Template {
  /** Day of month. Clamped to the month's length. */
  day: number;
  type: TransactionType;
  category: string;
  description: string;
  /** Base amount in baht. */
  baht: number;
  /** Extra satang added on some months so totals are not all round numbers. */
  satang?: number;
  /** Month offsets (0 = oldest of the six) in which this row appears. Omit for every month. */
  months?: number[];
  /** Amount drift per month, in baht. */
  drift?: number;
}

const TEMPLATES: Template[] = [
  {
    day: 1,
    type: "expense",
    category: "ค่าเช่าและสถานที่",
    description: "ค่าเช่าโต๊ะโคเวิร์กกิงสเปซ รายเดือน",
    baht: 4500,
  },
  {
    day: 3,
    type: "income",
    category: "ค่าบริการและงานโปรเจกต์",
    description: "ค่าดูแลเว็บไซต์รายเดือน ลูกค้าร้านอาหาร (สมมติ)",
    baht: 6500,
  },
  {
    day: 5,
    type: "expense",
    category: "ซอฟต์แวร์และเครื่องมือ",
    description: "ค่าสมาชิกโปรแกรมออกแบบ รายเดือน",
    baht: 1890,
  },
  {
    day: 6,
    type: "income",
    category: "ค่าบริการและงานโปรเจกต์",
    description: "งานออกแบบโลโก้และอัตลักษณ์ งวดที่ 1",
    baht: 18000,
    drift: 1500,
    months: [0, 2, 3, 5],
  },
  {
    day: 8,
    type: "expense",
    category: "ซอฟต์แวร์และเครื่องมือ",
    description: "ค่าโฮสติ้งและโดเมน",
    baht: 590,
    satang: 50,
  },
  {
    day: 9,
    type: "expense",
    category: "เดินทางและขนส่ง",
    description: "ค่าเดินทางไปประชุมกับลูกค้า",
    baht: 320,
    drift: 45,
  },
  {
    day: 11,
    type: "income",
    category: "ขายสินค้า",
    description: "ขายชุดเทมเพลตนำเสนอออนไลน์",
    baht: 2390,
    drift: 380,
  },
  {
    day: 12,
    type: "expense",
    category: "การตลาดและโฆษณา",
    description: "ค่าโฆษณาออนไลน์",
    baht: 2400,
    drift: 250,
  },
  {
    day: 14,
    type: "income",
    category: "ค่าบริการและงานโปรเจกต์",
    description: "งานออกแบบหน้าเว็บไซต์ ลูกค้าคลินิก (สมมติ)",
    baht: 32000,
    drift: -1800,
    months: [1, 3, 4, 5],
  },
  {
    day: 15,
    type: "expense",
    category: "ค่าจ้างและผู้รับเหมา",
    description: "ค่าจ้างฟรีแลนซ์เขียนคำโฆษณา",
    baht: 6000,
    months: [1, 3, 4],
  },
  {
    day: 17,
    type: "expense",
    category: "อุปกรณ์สำนักงาน",
    description: "หมึกพิมพ์และกระดาษตัวอย่างงาน",
    baht: 1250,
    satang: 75,
    months: [0, 2, 4],
  },
  {
    day: 18,
    type: "expense",
    category: "เดินทางและขนส่ง",
    description: "ค่าส่งเอกสารและตัวอย่างงาน",
    baht: 180,
    satang: 25,
  },
  {
    day: 20,
    type: "income",
    category: "ค่าบริการและงานโปรเจกต์",
    description: "งานออกแบบสื่อโซเชียล แพ็กเกจรายเดือน",
    baht: 9500,
    months: [0, 1, 2, 4, 5],
  },
  {
    day: 21,
    type: "expense",
    category: "รายจ่ายอื่น ๆ",
    description: "เครื่องดื่มระหว่างประชุมกับลูกค้า",
    baht: 285,
  },
  {
    day: 23,
    type: "expense",
    category: "ภาษีและค่าธรรมเนียม",
    description: "ค่าธรรมเนียมรับชำระเงินออนไลน์",
    baht: 412,
    satang: 30,
    drift: 28,
  },
  {
    day: 24,
    type: "expense",
    category: "ซอฟต์แวร์และเครื่องมือ",
    description: "ค่าคลังภาพและฟอนต์ลิขสิทธิ์",
    baht: 990,
    months: [0, 3],
  },
  {
    day: 26,
    type: "income",
    category: "รายรับอื่น ๆ",
    description: "ค่าวิทยากรเวิร์กช็อปออกแบบ",
    baht: 5000,
    months: [2, 5],
  },
  {
    day: 27,
    type: "expense",
    category: "อุปกรณ์สำนักงาน",
    description: "ขาตั้งจอและอุปกรณ์จัดโต๊ะทำงาน",
    baht: 2890,
    months: [1],
  },
  {
    day: 28,
    type: "expense",
    category: "ภาษีและค่าธรรมเนียม",
    description: "ค่าทำบัญชีและยื่นภาษี",
    baht: 1500,
  },
];

/** Six months of sample transactions ending today (Bangkok). Nothing is dated in the future. */
export function buildDemoTransactions(today: string, categories: Category[]): Transaction[] {
  const categoryByName = new Map(categories.map((category) => [category.name, category]));
  const currentMonth = monthKeyOf(today);
  const transactions: Transaction[] = [];
  let sequence = 0;

  for (let offset = 0; offset < 6; offset += 1) {
    const month = addMonths(currentMonth, offset - 5);
    const lastDay = Number(monthRange(month).to.slice(8));

    for (const template of TEMPLATES) {
      if (template.months && !template.months.includes(offset)) continue;

      const day = Math.min(template.day, lastDay);
      const date = `${month}-${String(day).padStart(2, "0")}`;
      sequence += 1;
      if (date > today) continue;

      const category = categoryByName.get(template.category);
      if (!category) continue;

      const baht = template.baht + (template.drift ?? 0) * offset;
      const satang = offset % 2 === 0 ? (template.satang ?? 0) : 0;

      transactions.push({
        id: uuid("d0000000", sequence),
        type: template.type,
        amountSatang: baht * 100 + satang,
        description: template.description,
        date,
        categoryId: category.id,
        createdAt: `${date}T0${(sequence % 9) + 1}:00:00.000Z`,
      });
    }
  }

  return transactions;
}
