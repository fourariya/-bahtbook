import type { CSSProperties, ReactNode } from "react";

import type { Summary } from "@/lib/finance/aggregate";
import { formatBaht } from "@/lib/finance/money";

interface StatementSheetProps {
  /** e.g. "เดือนนี้" */
  periodLabel: string;
  /** e.g. "1 พ.ย. 2569 ถึง 30 พ.ย. 2569" */
  rangeLabel: string;
  summary: Summary;
  headingLevel?: "h2" | "h3";
  footer?: ReactNode;
}

/**
 * The statement: the net result of the period, set large, with the outcome
 * pressed into the sheet as a stamp and the three figures it is made of beside it.
 */
export function StatementSheet({
  periodLabel,
  rangeLabel,
  summary,
  headingLevel: Heading = "h2",
  footer,
}: StatementSheetProps) {
  const { netSatang, incomeSatang, expenseSatang, count } = summary;
  const net = formatBaht(netSatang);
  const income = formatBaht(incomeSatang);
  const expense = formatBaht(expenseSatang);
  const outcome =
    count === 0
      ? null
      : netSatang > 0
        ? { tone: "profit", label: "กำไร" }
        : netSatang < 0
          ? { tone: "loss", label: "ขาดทุน" }
          : { tone: "even", label: "เท่าทุน" };

  return (
    <section className="sheet @container p-5 sm:p-7" aria-label={`ผลประกอบการสุทธิ ${periodLabel}`}>
      <div className="grid grid-cols-1 gap-6 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] @3xl:gap-10">
        <div className="min-w-0">
          <Heading className="text-base font-medium text-muted">
            ผลประกอบการสุทธิ {periodLabel}
          </Heading>
          <p className="mt-0.5 text-sm text-muted">{rangeLabel}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            <p
              data-testid="net-result"
              className={`statement-figure max-w-none leading-none font-semibold tracking-[-0.04em] whitespace-nowrap tabular-nums ${
                netSatang < 0 ? "text-error" : "text-print"
              }`}
              // The figure is never truncated: its size follows the number of
              // characters when the sheet is too narrow for the full size.
              style={{ "--figure-chars": net.length } as CSSProperties}
            >
              {net}
            </p>
            {outcome ? (
              <span className="stamp text-lg" data-tone={outcome.tone}>
                {outcome.label}
              </span>
            ) : null}
          </div>
        </div>

        <dl className="grid content-center text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-rule py-2.5">
            <dt className="font-medium text-ink-2">รายรับ</dt>
            <dd
              data-testid="total-income"
              className="fig statement-value ml-auto"
              style={{ "--figure-chars": income.length } as CSSProperties}
            >
              {income}
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-rule py-2.5">
            <dt className="font-medium text-ink-2">รายจ่าย</dt>
            <dd
              data-testid="total-expense"
              className="fig statement-value ml-auto"
              style={{ "--figure-chars": expense.length } as CSSProperties}
            >
              {expense}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="font-medium text-ink-2">จำนวนรายการ</dt>
            <dd data-testid="transaction-count" className="fig text-base">
              {count}
            </dd>
          </div>
        </dl>
      </div>
      {footer}
    </section>
  );
}
