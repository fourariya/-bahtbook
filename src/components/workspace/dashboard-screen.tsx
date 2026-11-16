"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useId, useMemo, useState } from "react";

import { CategoryBreakdown, MonthlyBars } from "@/components/charts/charts";
import { Amount, EmptyState, Select, Swatch } from "@/components/ui/primitives";
import { categoryTotals, monthlySummary, summarize } from "@/lib/finance/aggregate";
import {
  PERIOD_KEYS,
  PERIOD_LABELS,
  describeRange,
  formatThaiDate,
  formatThaiMonthLong,
  formatThaiMonthShort,
  isInRange,
  isPeriodKey,
  lastMonths,
  resolvePeriod,
  type PeriodKey,
} from "@/lib/finance/dates";
import { sortTransactions } from "@/lib/finance/filter";
import { formatBaht } from "@/lib/finance/money";

import { useWorkspace } from "./context";
import { StatementSheet } from "./statement-sheet";
import { useUrlMirror } from "./use-url-mirror";

export function DashboardScreen() {
  const { transactions, categories, today, basePath, openTransactionForm, displayName } =
    useWorkspace();
  const searchParams = useSearchParams();
  const mirrorUrl = useUrlMirror();
  const periodId = useId();

  const [period, setPeriod] = useState<PeriodKey>(() => {
    const fromUrl = searchParams.get("period");
    return isPeriodKey(fromUrl) ? fromUrl : "this-month";
  });

  function changePeriod(next: PeriodKey) {
    setPeriod(next);
    mirrorUrl(new URLSearchParams(next === "this-month" ? {} : { period: next }));
  }

  const range = useMemo(() => resolvePeriod(period, today), [period, today]);
  const inPeriod = useMemo(
    () => transactions.filter((transaction) => isInRange(transaction.date, range)),
    [transactions, range],
  );
  const summary = useMemo(() => summarize(inPeriod), [inPeriod]);
  const expenseByCategory = useMemo(
    () => categoryTotals(inPeriod, categories, "expense"),
    [inPeriod, categories],
  );
  const sixMonths = useMemo(
    () => monthlySummary(transactions, lastMonths(today, 6)),
    [transactions, today],
  );
  const recent = useMemo(
    () => sortTransactions(transactions, "date-desc").slice(0, 6),
    [transactions],
  );
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const hasAnyTransactions = transactions.length > 0;

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">ภาพรวม</h1>
          <p className="mt-1 text-sm text-muted lg:hidden">{displayName}</p>
        </div>
        <div className="w-full sm:w-52">
          <label htmlFor={periodId} className="label">
            ช่วงเวลา
          </label>
          <Select
            id={periodId}
            value={period}
            onChange={(event) => changePeriod(event.target.value as PeriodKey)}
          >
            {PERIOD_KEYS.map((key) => (
              <option key={key} value={key}>
                {PERIOD_LABELS[key]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <StatementSheet
        periodLabel={PERIOD_LABELS[period]}
        rangeLabel={describeRange(range)}
        summary={summary}
        footer={
          !hasAnyTransactions ? (
            <div className="mt-5 border-t border-rule pt-1">
              <EmptyState
                title="ยังไม่มีรายการ"
                body="บันทึกรายรับหรือรายจ่ายรายการแรก แล้วตัวเลขและกราฟในหน้านี้จะคำนวณจากรายการของคุณทันที"
                action={
                  <button
                    type="button"
                    className="btn btn-card"
                    onClick={() => openTransactionForm()}
                  >
                    <Plus aria-hidden="true" className="size-4" />
                    เพิ่มรายการแรก
                  </button>
                }
              />
            </div>
          ) : summary.count === 0 ? (
            <p className="mt-5 border-t border-rule pt-4 text-sm text-muted">
              ไม่มีรายการในช่วง{PERIOD_LABELS[period]} ลองเลือกช่วงเวลาอื่น หรือเพิ่มรายการของช่วงนี้
            </p>
          ) : null
        }
      />

      {hasAnyTransactions ? (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <section className="sheet p-5 sm:p-6" aria-labelledby="dash-monthly">
              <h2 id="dash-monthly" className="text-lg">
                รายรับเทียบรายจ่าย 6 เดือนล่าสุด
              </h2>
              <div className="mt-4">
                <MonthlyBars data={sixMonths} title="รายรับเทียบรายจ่าย 6 เดือนล่าสุด" />
              </div>
            </section>

            <section className="sheet p-5 sm:p-6" aria-labelledby="dash-categories">
              <h2 id="dash-categories" className="text-lg">
                รายจ่ายตามหมวดหมู่ {PERIOD_LABELS[period]}
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

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <section className="sheet p-5 sm:p-6" aria-labelledby="dash-recent">
              <div className="flex items-baseline justify-between gap-4">
                <h2 id="dash-recent" className="text-lg">
                  รายการล่าสุด
                </h2>
                <Link href={`${basePath}/transactions`} className="text-link hit-area text-sm">
                  ดูรายการทั้งหมด
                </Link>
              </div>
              <ul className="@container mt-3">
                {recent.map((transaction) => {
                  const category = categoryById.get(transaction.categoryId);
                  return (
                    <li
                      key={transaction.id}
                      className="flex flex-wrap items-baseline gap-x-4 border-b border-rule py-2.5 text-sm last:border-b-0"
                    >
                      <span className="min-w-0 flex-[1_1_6rem] truncate font-medium">
                        {transaction.description}
                      </span>
                      <Amount
                        type={transaction.type}
                        satang={transaction.amountSatang}
                        className="ml-auto"
                        fit
                      />
                      <span className="flex min-w-0 basis-full items-baseline gap-2 text-muted">
                        {formatThaiDate(transaction.date)}
                        {category ? (
                          <span className="flex min-w-0 items-baseline gap-1.5">
                            <Swatch color={category.color} />
                            <span className="truncate">{category.name}</span>
                          </span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="sheet p-5 sm:p-6" aria-labelledby="dash-summary">
              <h2 id="dash-summary" className="text-lg">
                สรุปรายเดือน
              </h2>
              <div className="mt-3 overflow-x-auto">
                <table className="ledger">
                  <thead>
                    <tr>
                      <th scope="col">เดือน</th>
                      <th scope="col" className="num">
                        รายรับ
                      </th>
                      <th scope="col" className="num">
                        รายจ่าย
                      </th>
                      <th scope="col" className="num">
                        สุทธิ
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...sixMonths].reverse().map((row) => (
                      <tr key={row.month}>
                        <td className="whitespace-nowrap">
                          <span className="sm:hidden">{formatThaiMonthShort(row.month)}</span>
                          <span className="hidden sm:inline">{formatThaiMonthLong(row.month)}</span>
                        </td>
                        <td className="num fig">{formatBaht(row.incomeSatang, { whole: true })}</td>
                        <td className="num fig">
                          {formatBaht(row.expenseSatang, { whole: true })}
                        </td>
                        <td className={`num fig ${row.netSatang < 0 ? "text-error" : ""}`}>
                          {formatBaht(row.netSatang, { whole: true })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-sm text-muted">ตารางนี้แสดงเป็นบาทถ้วน ตัดเศษสตางค์ออก</p>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
