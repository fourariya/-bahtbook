import { ChevronDown } from "lucide-react";
import type { ComponentProps, CSSProperties, ReactNode } from "react";

import { formatBaht } from "@/lib/finance/money";
import type { CategoryColor, TransactionType } from "@/lib/finance/types";

/** Literal class names so Tailwind can see them. Keys match `categories.color`. */
export const CATEGORY_SWATCH: Record<CategoryColor, string> = {
  clay: "bg-cat-clay",
  ochre: "bg-cat-ochre",
  moss: "bg-cat-moss",
  pine: "bg-cat-pine",
  slate: "bg-cat-slate",
  plum: "bg-cat-plum",
  rose: "bg-cat-rose",
  ink: "bg-cat-ink",
};

export const CATEGORY_COLOR_LABELS: Record<CategoryColor, string> = {
  clay: "ส้มอิฐ",
  ochre: "เหลืองมัสตาร์ด",
  moss: "เขียวมอส",
  pine: "เขียวสน",
  slate: "เทาอมฟ้า",
  plum: "ม่วงพลัม",
  rose: "ชมพูกุหลาบ",
  ink: "เทาเข้ม",
};

/** A legend key: identifies a category next to its name. */
export function Swatch({ color, className = "" }: { color: CategoryColor; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-2.5 shrink-0 rounded-[2px] ${CATEGORY_SWATCH[color]} ${className}`}
    />
  );
}

/**
 * A signed amount. Income is marked with a plus and the success colour;
 * an expense with a minus in ink. The sign carries the meaning, colour only supports it.
 */
export function Amount({
  type,
  satang,
  className = "",
  fit = false,
}: {
  type: TransactionType;
  satang: number;
  className?: string;
  /** Scale down, instead of overflowing, when too long for its list (a @container). */
  fit?: boolean;
}) {
  const signed = type === "income" ? satang : -satang;
  const text = formatBaht(signed, { sign: "always" });
  return (
    <span
      className={`fig ${fit ? "fit-amount" : ""} ${type === "income" ? "text-success" : "text-ink"} ${className}`}
      style={fit ? ({ "--figure-chars": text.length } as CSSProperties) : undefined}
    >
      {text}
    </span>
  );
}

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}

/** Label above, control, and one helper line that the error replaces. */
export function Field({ id, label, error, hint, optional, children, className = "" }: FieldProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
        {optional ? <span className="font-normal text-muted"> (ไม่บังคับ)</span> : null}
      </label>
      {children}
      <p id={`${id}-help`} className="helper" data-error={error ? "true" : undefined}>
        {error ?? hint ?? ""}
      </p>
    </div>
  );
}

/** Native select with the chevron drawn from the icon set. */
export function Select({ className = "", children, ...props }: ComponentProps<"select">) {
  return (
    <span className={`relative block ${className}`}>
      <select className="input" {...props}>
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted"
      />
    </span>
  );
}

export function Spinner() {
  return <span aria-hidden="true" className="spinner inline-block" />;
}

/** What is empty, why it matters, and the one action that fills it. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 py-8">
      <div>
        <p className="font-medium text-ink">{title}</p>
        <p className="mt-1 text-sm text-muted">{body}</p>
      </div>
      {action}
    </div>
  );
}
