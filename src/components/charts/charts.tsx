"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CATEGORY_SWATCH, Swatch } from "@/components/ui/primitives";
import { formatShare, type CategoryTotal, type MonthlySummary } from "@/lib/finance/aggregate";
import { formatThaiMonthLong, formatThaiMonthShort } from "@/lib/finance/dates";
import { formatBaht, formatBahtCompact } from "@/lib/finance/money";

/* Every chart: hairline grid, one y-axis starting at zero, no animation, and a
 * data table underneath for people who cannot or would rather not read a chart. */

const AXIS_TICK = { fill: "var(--color-muted)", fontSize: 12 };

interface TooltipEntry {
  name?: string | number;
  value?: number | string | ReadonlyArray<number | string>;
  color?: string;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ReadonlyArray<TooltipEntry>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="sheet px-3 py-2 text-sm">
      <p className="font-body font-medium">{formatThaiMonthLong(String(label))}</p>
      <ul className="mt-1 grid gap-0.5">
        {payload.map((entry) => (
          <li key={String(entry.name)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2 font-body text-muted">
              <span
                aria-hidden="true"
                className="inline-block size-2.5 rounded-[2px]"
                style={{ backgroundColor: entry.color }}
              />
              {entry.name}
            </span>
            <span className="fig">{formatBaht(Number(entry.value))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Legend({ items }: { items: Array<{ label: string; swatch: string }> }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`inline-block size-2.5 rounded-[2px] ${item.swatch}`}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function DataTable({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: Array<Array<string>>;
}) {
  return (
    <details className="mt-3 text-sm">
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-muted underline decoration-rule-2 underline-offset-4">
        ดูข้อมูลเป็นตาราง
      </summary>
      <div className="overflow-x-auto">
        <table className="ledger mt-1">
          <caption className="visually-hidden">{caption}</caption>
          <thead>
            <tr>
              {head.map((cell, index) => (
                <th key={cell} scope="col" className={index === 0 ? "" : "num"}>
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]}>
                {row.map((cell, index) =>
                  index === 0 ? (
                    <th key={index} scope="row" className="!border-rule !text-ink font-normal">
                      {cell}
                    </th>
                  ) : (
                    <td key={index} className="num fig">
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Income beside expenses for each month. Expenses carry the accent; income stays neutral. */
export function MonthlyBars({ data, title }: { data: MonthlySummary[]; title: string }) {
  return (
    <figure className="m-0">
      <Legend
        items={[
          { label: "รายรับ", swatch: "bg-slate" },
          { label: "รายจ่าย", swatch: "bg-accent" },
        ]}
      />
      <div
        role="img"
        aria-label={`${title} แผนภูมิแท่งเทียบรายรับกับรายจ่ายรายเดือน รายละเอียดอยู่ในตารางด้านล่าง`}
        className="mt-3 h-64"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            barGap={3}
            barCategoryGap="26%"
            margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--color-rule)" />
            <XAxis
              dataKey="month"
              tickFormatter={formatThaiMonthShort}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: "var(--color-rule-2)" }}
              interval="preserveStartEnd"
              minTickGap={8}
            />
            <YAxis
              tickFormatter={formatBahtCompact}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              tickCount={5}
              width={52}
            />
            <Tooltip content={ChartTooltip} cursor={{ fill: "var(--color-paper-2)" }} />
            <Bar
              dataKey="incomeSatang"
              name="รายรับ"
              fill="var(--color-slate)"
              radius={[2, 2, 0, 0]}
              maxBarSize={24}
              isAnimationActive={false}
            />
            <Bar
              dataKey="expenseSatang"
              name="รายจ่าย"
              fill="var(--color-accent)"
              radius={[2, 2, 0, 0]}
              maxBarSize={24}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable
        caption={title}
        head={["เดือน", "รายรับ", "รายจ่าย", "สุทธิ"]}
        rows={data.map((row) => [
          formatThaiMonthLong(row.month),
          formatBaht(row.incomeSatang),
          formatBaht(row.expenseSatang),
          formatBaht(row.netSatang),
        ])}
      />
    </figure>
  );
}

/** Net result per month as a line, with the zero line drawn so a loss reads as below it. */
export function NetTrend({ data, title }: { data: MonthlySummary[]; title: string }) {
  return (
    <figure className="m-0">
      <Legend items={[{ label: "ผลสุทธิรายเดือน (รายรับ ลบ รายจ่าย)", swatch: "bg-ink" }]} />
      <div
        role="img"
        aria-label={`${title} แผนภูมิเส้นแสดงผลสุทธิรายเดือน รายละเอียดอยู่ในตารางด้านล่าง`}
        className="mt-3 h-64"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-rule)" />
            <XAxis
              dataKey="month"
              tickFormatter={formatThaiMonthShort}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: "var(--color-rule-2)" }}
              interval="preserveStartEnd"
              minTickGap={8}
              padding={{ left: 16, right: 16 }}
            />
            <YAxis
              tickFormatter={formatBahtCompact}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              tickCount={5}
              width={52}
            />
            <ReferenceLine y={0} stroke="var(--color-muted)" />
            <Tooltip content={ChartTooltip} cursor={{ stroke: "var(--color-rule-2)" }} />
            <Line
              type="linear"
              dataKey="netSatang"
              name="ผลสุทธิ"
              stroke="var(--color-ink)"
              strokeWidth={2}
              dot={{
                r: 3,
                fill: "var(--color-cotton)",
                stroke: "var(--color-ink)",
                strokeWidth: 2,
              }}
              activeDot={{ r: 5, fill: "var(--color-accent)", stroke: "var(--color-cotton)" }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <DataTable
        caption={title}
        head={["เดือน", "ผลสุทธิ"]}
        rows={data.map((row) => [formatThaiMonthLong(row.month), formatBaht(row.netSatang)])}
      />
    </figure>
  );
}

/**
 * Parts of a whole as one stacked bar and a ranked list. The list is the
 * accessible version: every value is written out, so the bar is decorative.
 */
export function CategoryBreakdown({ totals }: { totals: CategoryTotal[] }) {
  const grandTotal = totals.reduce((sum, total) => sum + total.totalSatang, 0);

  return (
    <div>
      <div aria-hidden="true" className="flex h-3 gap-0.5 overflow-hidden rounded-[2px]">
        {totals.map((total) => (
          <span
            key={total.categoryId}
            className={`min-w-0.5 ${CATEGORY_SWATCH[total.color]}`}
            style={{ flexGrow: total.totalSatang, flexBasis: 0 }}
          />
        ))}
      </div>
      <ol className="mt-4 grid gap-0">
        {totals.map((total) => (
          <li
            key={total.categoryId}
            className="grid grid-cols-[1fr_auto_3.5rem] items-baseline gap-3 border-b border-rule py-2 text-sm last:border-b-0"
          >
            <span className="flex min-w-0 items-baseline gap-2">
              <Swatch color={total.color} className="translate-y-px" />
              <span className="truncate">{total.name}</span>
            </span>
            <span className="fig">{formatBaht(total.totalSatang)}</span>
            <span className="fig text-right text-muted">{formatShare(total.share)}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 flex items-baseline justify-between border-t border-rule-2 pt-2 text-sm font-medium">
        <span>รวมรายจ่าย</span>
        <span className="fig">{formatBaht(grandTotal)}</span>
      </p>
    </div>
  );
}
