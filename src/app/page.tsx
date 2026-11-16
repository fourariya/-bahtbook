import Link from "next/link";

import { Amount, Swatch } from "@/components/ui/primitives";
import { BrandMark } from "@/components/workspace/brand-mark";
import { StatementSheet } from "@/components/workspace/statement-sheet";
import { BRAND } from "@/lib/brand";
import { buildDemoCategories, buildDemoTransactions } from "@/lib/demo/data";
import { summarize } from "@/lib/finance/aggregate";
import {
  describeRange,
  formatThaiDate,
  isInRange,
  resolvePeriod,
  todayInBangkok,
} from "@/lib/finance/dates";
import { sortTransactions } from "@/lib/finance/filter";

// The sample statement is dated relative to today, so refresh it hourly.
export const revalidate = 3600;

const FEATURES = [
  {
    title: "บันทึกรายรับรายจ่าย",
    body: "เพิ่ม แก้ไข และลบรายการ พร้อมหมวดหมู่ วันที่ และรายละเอียด",
  },
  {
    title: "ภาพรวมจากรายการจริง",
    body: "ผลสุทธิ รายรับ และรายจ่ายตามช่วงเวลาที่เลือก อัปเดตทันทีที่บันทึก",
  },
  {
    title: "ค้นหาและกรอง",
    body: "ตามคำค้น ประเภท หมวดหมู่ และช่วงวันที่ เรียงตามวันที่หรือจำนวนเงิน",
  },
  {
    title: "กราฟวิเคราะห์",
    body: "รายรับเทียบรายจ่ายรายเดือน แนวโน้มผลสุทธิ และสัดส่วนตามหมวดหมู่",
  },
  {
    title: "หมวดหมู่ของคุณเอง",
    body: "เริ่มจากหมวดหมู่พื้นฐาน แล้วเพิ่ม เปลี่ยนชื่อ หรือกำหนดสีตามธุรกิจ",
  },
  {
    title: "ส่งออก CSV",
    body: "ดาวน์โหลดรายการที่กรองไว้ เปิดใน Excel ได้โดยภาษาไทยไม่เพี้ยน",
  },
];

const STACK = [
  ["Framework", "Next.js 16 (App Router), React 19, TypeScript"],
  ["ฐานข้อมูล", "Supabase PostgreSQL พร้อม Row Level Security"],
  ["ระบบสมาชิก", "Supabase Auth ผ่าน session cookie ฝั่ง server"],
  ["ส่วนแสดงผล", "Tailwind CSS 4, Recharts"],
  ["การทดสอบ", "Vitest, PGlite, Playwright"],
];

export default function LandingPage() {
  const today = todayInBangkok();
  const categories = buildDemoCategories();
  const transactions = buildDemoTransactions(today, categories);
  const range = resolvePeriod("this-month", today);
  const thisMonth = transactions.filter((transaction) => isInRange(transaction.date, range));
  const recent = sortTransactions(thisMonth, "date-desc").slice(0, 3);
  const categoryById = new Map(categories.map((category) => [category.id, category]));

  return (
    <>
      <header className="desk">
        <div className="shell flex h-16 items-center justify-between gap-4">
          <Link
            href="/"
            aria-label={`${BRAND.name} หน้าแรก`}
            className="flex min-h-11 items-center gap-2 text-lg font-semibold tracking-display no-underline"
          >
            <BrandMark />
            {BRAND.name}
          </Link>
          <nav aria-label="เมนูหลัก" className="flex items-center gap-1 sm:gap-3">
            <Link href="/login" className="nav-link">
              เข้าสู่ระบบ
            </Link>
            <Link href="/signup" className="btn btn-card">
              สมัครใช้งาน
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="desk">
          <div className="shell grid items-center gap-10 pt-10 pb-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14 lg:pt-16 lg:pb-24">
            <div>
              <h1 className="text-3xl lg:text-hero">รู้ว่าเงินของธุรกิจไปไหน ทุกบาท</h1>
              <p className="lead mt-4 text-ink-2">
                บันทึกรายรับรายจ่าย แล้วเห็นผลประกอบการของคุณในหน้าเดียว
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/demo" className="btn btn-ink btn-lg">
                  ลองใช้ตัวอย่าง
                </Link>
                <Link href="/signup" className="btn btn-card btn-lg">
                  สมัครใช้งาน
                </Link>
              </div>
              <p className="mt-4 text-sm text-muted">ตัวอย่างเปิดได้ทันที ไม่ต้องสมัครสมาชิก</p>
            </div>

            <figure className="m-0 min-w-0">
              <StatementSheet
                periodLabel="เดือนนี้"
                rangeLabel={describeRange(range)}
                summary={summarize(thisMonth)}
                footer={
                  <ul className="mt-5 border-t border-rule">
                    {recent.map((transaction) => {
                      const category = categoryById.get(transaction.categoryId);
                      return (
                        <li
                          key={transaction.id}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 border-b border-rule py-2 text-sm last:border-b-0"
                        >
                          <span className="flex min-w-0 items-baseline gap-2">
                            {category ? <Swatch color={category.color} /> : null}
                            <span className="truncate">{transaction.description}</span>
                          </span>
                          <Amount type={transaction.type} satang={transaction.amountSatang} />
                          <span className="col-span-2 text-muted">
                            {formatThaiDate(transaction.date)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                }
              />
              <figcaption className="mt-3 text-sm text-muted">
                หน้าจอจริงของระบบ แสดงด้วยข้อมูลสมมติของสตูดิโอออกแบบตัวอย่าง
              </figcaption>
            </figure>
          </div>
        </section>

        <section id="features" className="shell py-16 lg:py-20" aria-labelledby="features-title">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14">
            <div>
              <h2 id="features-title" className="text-2xl">
                สิ่งที่ทำได้จริงในระบบนี้
              </h2>
              <dl className="mt-6 grid gap-x-8 sm:grid-cols-2">
                {FEATURES.map((feature) => (
                  <div key={feature.title} className="border-t border-rule py-4">
                    <dt className="font-semibold">{feature.title}</dt>
                    <dd className="mt-1 text-sm text-muted">{feature.body}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="sheet self-start p-6">
              <h2 className="text-lg">เทคโนโลยีที่ใช้</h2>
              <dl className="mt-3">
                {STACK.map(([term, detail]) => (
                  <div key={term} className="border-b border-rule py-2.5 text-sm last:border-b-0">
                    <dt className="font-semibold">{term}</dt>
                    <dd className="text-muted">{detail}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        <section className="board" aria-labelledby="security-title">
          <div className="shell grid gap-8 py-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14 lg:py-20">
            <h2 id="security-title" className="text-2xl">
              ข้อมูลของแต่ละบัญชีถูกแยกกันที่ฐานข้อมูล
            </h2>
            <dl className="grid gap-6 sm:grid-cols-3">
              <div>
                <dt className="font-semibold">Row Level Security</dt>
                <dd className="mt-1 text-sm text-board-muted">
                  PostgreSQL ตรวจทุกคำสั่ง ผู้ใช้อ่านและแก้ไขได้เฉพาะแถวของตัวเอง
                </dd>
              </div>
              <div>
                <dt className="font-semibold">ระบบสมาชิกจริง</dt>
                <dd className="mt-1 text-sm text-board-muted">
                  Supabase Auth ดูแลรหัสผ่าน และ session อยู่ใน cookie ที่ script อ่านไม่ได้
                </dd>
              </div>
              <div>
                <dt className="font-semibold">ตัวเลขไม่คลาดเคลื่อน</dt>
                <dd className="mt-1 text-sm text-board-muted">
                  จำนวนเงินเก็บเป็นสตางค์แบบจำนวนเต็ม ไม่ใช้ทศนิยมแบบ floating point
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="shell py-16 lg:py-20" aria-labelledby="demo-title">
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
            <div>
              <h2 id="demo-title" className="text-2xl">
                ลองก่อนได้ โดยไม่กระทบข้อมูลของใคร
              </h2>
              <p className="mt-3 text-ink-2">
                โหมดตัวอย่างเปิดทุกหน้าจอด้วยข้อมูลสมมติ สิ่งที่คุณเพิ่มหรือแก้ไขอยู่ในแท็บของคุณเท่านั้น
                และหายไปเมื่อโหลดหน้าใหม่
              </p>
              <p className="mt-3 text-ink-2">
                หากต้องการให้ข้อมูลถูกบันทึกจริง ให้สมัครบัญชี รายการของคุณจะเก็บในฐานข้อมูลและเห็นได้เฉพาะคุณ
              </p>
            </div>
            <div className="flex flex-wrap content-center gap-3 lg:justify-end">
              <Link href="/demo" className="btn btn-card btn-lg">
                เปิดโหมดตัวอย่าง
              </Link>
              <Link href="/signup" className="btn btn-card btn-lg">
                สมัครใช้งาน
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-rule">
        <div className="shell flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 py-8 text-sm text-muted">
          <p className="max-w-none">
            {BRAND.name} เป็นโปรเจกต์สาธิตสำหรับแสดงผลงานพัฒนาเว็บ ไม่ใช่บริการเชิงพาณิชย์
            ชื่อและข้อมูลตัวอย่างทั้งหมดเป็นข้อมูลสมมติ
          </p>
          <nav aria-label="ลิงก์ท้ายหน้า" className="flex gap-5">
            <Link href="/demo" className="text-link hit-area">
              ตัวอย่าง
            </Link>
            <Link href="/login" className="text-link hit-area">
              เข้าสู่ระบบ
            </Link>
            <Link href="/signup" className="text-link hit-area">
              สมัครใช้งาน
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
