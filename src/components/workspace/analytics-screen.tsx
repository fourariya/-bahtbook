"use client";

import { Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useId, useMemo, useState } from "react";

import { CategoryBreakdown, MonthlyBars, NetTrend } from "@/components/charts/charts";
import { EmptyState, Select } from "@/components/ui/primitives";
import { categoryTotals, formatShare, monthlySummary, summarize } from "@/lib/finance/aggregate";
import {
  formatThaiMonthLong,
  lastMonths,
  listMonths,
  monthKeyOf,
  monthRange,
} from "@/lib/finance/dates";
import { formatBaht } from "@/lib/finance/money";

import { useWorkspace } from "./context";
import { useUrlMirror } from "./use-url-mirror";

const RANGES = {
  "6m": "6 เดือนล่าสุด",
  "12m": "12 เดือนล่าสุด",
  ytd: "ปีนี้ถึงเดือนปัจจุบัน",
} as const;
type RangeKey = keyof typeof RANGES;

function monthsFor(range: RangeKey, today: string): string[] {
  if (range === "6m") return lastMonths(today, 6);
  if (range === "12m") return lastMonths(today, 12);
  return listMonths(`${today.slice(0, 4)}-01`, monthKeyOf(today));
}

export function AnalyticsScreen() {
  const { transactions, categories, today, openTransactionForm } = useWorkspace();
  const searchParams = useSearchParams();
  const mirrorUrl = useUrlMirror();
  const rangeId = useId();

  const [range, setRange] = useState<RangeKey>(() => {
    const fromUrl = searchParams.get("range");
    return fromUrl && fromUrl in RANGES ? (fromUrl as RangeKey) : "6m";
  });

  function changeRange(next: RangeKey) {
    setRange(next);
    mirrorUrl(new URLSearchParams(next === "6m" ? {} : { range: next }));
  }

  const months = useMemo(() => monthsFor(range, today), [range, today]);
  const inRange = useMemo(() => {
    const from = monthRange(months[0]).from;
    const to = monthRange(months[months.length - 1]).to;
    return transactions.filter((transaction) => transaction.date >= from && transaction.date <= to);
  }, [transactions, months]);

  const monthly = useMemo(() => monthlySummary(inRange, months), [inRange, months]);
  const totals = useMemo(() => summarize(inRange), [inRange]);
  const expenseByCategory = useMemo(
    () => categoryTotals(inRange, categories, "expense"),
    [inRange, categories],
  );

  // Every statement below is computed from the rows in range. Nothing is estimated.
  const facts = useMemo(() => {
    const monthsWithExpense = monthly.filter((row) => row.expenseSatang > 0);
    const highest = monthsWithExpense.reduce<(typeof monthly)[number] | null>(
      (top, row) => (top === null || row.expenseSatang > top.expenseSatang ? row : top),
      null,
    );
    const best = monthly
      .filter((row) => row.count > 0)
      .reduce<(typeof monthly)[number] | null>(
        (top, row) => (top === null || row.netSatang > top.netSatang ? row : top),
        null,
      );
    const topCategory = expenseByCategory[0] ?? null;
    return {
      averageExpense: Math.round(totals.expenseSatang / months.length),
      highest,
      best,
      topCategory,
    };
  }, [monthly, expenseByCategory, totals.expenseSatang, months.length]);

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl">วิเคราะห์</h1>
        <div className="w-full sm:w-60">
          <label htmlFor={rangeId} className="label">
            ช่วงเวลา
          </label>
          <Select
            id={rangeId}
            value={range}
            onChange={(event) => changeRange(event.target.value as RangeKey)}
          >
            {Object.entries(RANGES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {inRange.length === 0 ? (
        <section className="sheet p-5 sm:p-6">
          <EmptyState
            title={transactions.length === 0 ? "ยังไม่มีข้อมูลให้วิเคราะห์" : "ไม่มีรายการในช่วงเวลานี้"}
            body={
              transactions.length === 0
                ? "กราฟในหน้านี้สร้างจากรายการที่คุณบันทึกเท่านั้น เพิ่มรายการแรกเพื่อเริ่มเห็นแนวโน้ม"
                : "ลองเลือกช่วงเวลาที่ยาวขึ้น หรือเพิ่มรายการของช่วงนี้"
            }
            action={
              <button type="button" className="btn btn-card" onClick={() => openTransactionForm()}>
                <Plus aria-hidden="true" className="size-4" />
                เพิ่มรายการ
              </button>
            }
          />
        </section>
      ) : (
        <>
          <section className="sheet p-5 sm:p-6" aria-labelledby="facts-title">
            <h2 id="facts-title" className="text-lg">
              ข้อสังเกตจากรายการของคุณ
            </h2>
            <dl className="mt-3 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-4">
              <Fact
                term="รายจ่ายเฉลี่ยต่อเดือน"
                value={formatBaht(facts.averageExpense)}
                note={`เฉลี่ยจาก ${months.length} เดือน`}
              />
              <Fact
                term="เดือนที่จ่ายมากที่สุด"
                value={facts.highest ? formatThaiMonthLong(facts.highest.month) : "ไม่มี"}
                note={facts.highest ? formatBaht(facts.highest.expenseSatang) : "ยังไม่มีรายจ่าย"}
              />
              <Fact
                term="หมวดที่จ่ายมากที่สุด"
                value={facts.topCategory?.name ?? "ไม่มี"}
                note={
                  facts.topCategory
                    ? `${formatBaht(facts.topCategory.totalSatang)} คิดเป็น ${formatShare(facts.topCategory.share)} ของรายจ่าย`
                    : "ยังไม่มีรายจ่าย"
                }
              />
              <Fact
                term="เดือนที่ผลสุทธิดีที่สุด"
                value={facts.best ? formatThaiMonthLong(facts.best.month) : "ไม่มี"}
                note={facts.best ? formatBaht(facts.best.netSatang) : ""}
              />
            </dl>
          </section>

          <section className="sheet p-5 sm:p-6" aria-labelledby="chart-monthly">
            <h2 id="chart-monthly" className="text-lg">
              รายรับเทียบรายจ่ายรายเดือน
            </h2>
            <div className="mt-4">
              <MonthlyBars data={monthly} title={`รายรับเทียบรายจ่ายรายเดือน ${RANGES[range]}`} />
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="sheet p-5 sm:p-6" aria-labelledby="chart-trend">
              <h2 id="chart-trend" className="text-lg">
                แนวโน้มผลสุทธิ
              </h2>
              <div className="mt-4">
                <NetTrend data={monthly} title={`แนวโน้มผลสุทธิรายเดือน ${RANGES[range]}`} />
              </div>
            </section>

            <section className="sheet p-5 sm:p-6" aria-labelledby="chart-categories">
              <h2 id="chart-categories" className="text-lg">
                รายจ่ายตามหมวดหมู่
              </h2>
              <div className="mt-4">
                {expenseByCategory.length > 0 ? (
                  <CategoryBreakdown totals={expenseByCategory} />
                ) : (
                  <EmptyState
                    title="ยังไม่มีรายจ่ายในช่วงนี้"
                    body="เมื่อบันทึกรายจ่าย สัดส่วนของแต่ละหมวดหมู่จะแสดงที่นี่"
                  />
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Fact({ term, value, note }: { term: string; value: string; note: string }) {
  return (
    <div className="border-b border-rule py-3 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 lg:border-b-0">
      <dt className="text-sm text-muted">{term}</dt>
      <dd className="mt-0.5 text-lg font-semibold break-words">{value}</dd>
      <dd className="text-sm text-muted">{note}</dd>
    </div>
  );
}
