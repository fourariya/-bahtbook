"use client";

import {
  ArrowDown,
  ArrowUp,
  Download,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useDeferredValue, useId, useMemo, useState } from "react";

import { Amount, EmptyState, Select, Swatch } from "@/components/ui/primitives";
import { summarize } from "@/lib/finance/aggregate";
import { transactionsToCsv } from "@/lib/finance/csv";
import { MAX_DATE, MIN_DATE, formatThaiDate } from "@/lib/finance/dates";
import {
  DEFAULT_FILTERS,
  SORT_KEYS,
  SORT_LABELS,
  filterTransactions,
  filtersToSearchParams,
  hasActiveFilters,
  parseFilters,
  sortTransactions,
  type SortKey,
  type TransactionFilters,
} from "@/lib/finance/filter";
import { formatBaht } from "@/lib/finance/money";
import { TYPE_LABELS, type Transaction } from "@/lib/finance/types";

import { useWorkspace } from "./context";
import { useUrlMirror } from "./use-url-mirror";

const PAGE_SIZE = 50;

export function TransactionsScreen() {
  const { transactions, categories, today, openTransactionForm, requestDelete, notify } =
    useWorkspace();
  const searchParams = useSearchParams();
  const mirrorUrl = useUrlMirror();
  const ids = useId();

  const [filters, setFilters] = useState<TransactionFilters>(() =>
    parseFilters(new URLSearchParams(searchParams.toString())),
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  function changeFilters(patch: Partial<TransactionFilters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    setVisibleCount(PAGE_SIZE);
    mirrorUrl(filtersToSearchParams(next));
  }

  // Typing stays responsive on long lists: the list catches up a moment later.
  const deferredFilters = useDeferredValue(filters);
  const filtered = useMemo(
    () =>
      sortTransactions(
        filterTransactions(transactions, deferredFilters, categories),
        deferredFilters.sort,
      ),
    [transactions, categories, deferredFilters],
  );
  const totals = useMemo(() => summarize(filtered), [filtered]);
  const visible = filtered.slice(0, visibleCount);
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const active = hasActiveFilters(filters);
  const activeCount = [
    filters.type !== "all",
    filters.categoryId !== "all",
    filters.from !== null,
    filters.to !== null,
  ].filter(Boolean).length;

  function exportCsv() {
    const csv = transactionsToCsv(filtered, categories);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `transactions-${today}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    notify("success", `ส่งออก ${filtered.length} รายการเป็นไฟล์ CSV แล้ว`);
  }

  function toggleSort(column: "date" | "amount") {
    const descending: SortKey = `${column}-desc`;
    const ascending: SortKey = `${column}-asc`;
    changeFilters({ sort: filters.sort === descending ? ascending : descending });
  }

  function sortState(column: "date" | "amount"): "ascending" | "descending" | "none" {
    if (filters.sort === `${column}-asc`) return "ascending";
    if (filters.sort === `${column}-desc`) return "descending";
    return "none";
  }

  const hasAnyTransactions = transactions.length > 0;

  return (
    <div className="grid grid-cols-1 gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl">รายการ</h1>
        <button
          type="button"
          className="btn btn-card"
          onClick={exportCsv}
          disabled={filtered.length === 0}
          title={filtered.length === 0 ? "ไม่มีรายการให้ส่งออก" : undefined}
        >
          <Download aria-hidden="true" className="size-4" />
          ส่งออก CSV
        </button>
      </div>

      <section className="sheet p-4 sm:p-5" aria-label="ค้นหาและตัวกรอง">
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor={`${ids}-q`} className="label">
              ค้นหา
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
              />
              <input
                id={`${ids}-q`}
                type="search"
                name="q"
                className="input pl-9"
                placeholder="รายละเอียด หมวดหมู่ หรือจำนวนเงิน"
                autoComplete="off"
                maxLength={100}
                value={filters.query}
                onChange={(event) => changeFilters({ query: event.target.value })}
              />
            </div>
          </div>
          <button
            type="button"
            className="btn btn-card md:hidden"
            aria-expanded={filtersOpen}
            aria-controls={`${ids}-filters`}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal aria-hidden="true" className="size-4" />
            ตัวกรอง{activeCount > 0 ? ` (${activeCount})` : ""}
          </button>
        </div>

        <div
          id={`${ids}-filters`}
          className={`mt-4 grid-cols-2 gap-x-3 gap-y-4 md:grid md:grid-cols-5 ${filtersOpen ? "grid" : "hidden"}`}
        >
          <div>
            <label htmlFor={`${ids}-type`} className="label">
              ประเภท
            </label>
            <Select
              id={`${ids}-type`}
              value={filters.type}
              onChange={(event) =>
                changeFilters({ type: event.target.value as TransactionFilters["type"] })
              }
            >
              <option value="all">ทุกประเภท</option>
              <option value="income">{TYPE_LABELS.income}</option>
              <option value="expense">{TYPE_LABELS.expense}</option>
            </Select>
          </div>
          <div>
            <label htmlFor={`${ids}-category`} className="label">
              หมวดหมู่
            </label>
            <Select
              id={`${ids}-category`}
              value={filters.categoryId}
              onChange={(event) => changeFilters({ categoryId: event.target.value })}
            >
              <option value="all">ทุกหมวดหมู่</option>
              {(["expense", "income"] as const).map((type) => (
                <optgroup key={type} label={TYPE_LABELS[type]}>
                  {categories
                    .filter((category) => category.type === type)
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor={`${ids}-from`} className="label">
              ตั้งแต่วันที่
            </label>
            <input
              id={`${ids}-from`}
              type="date"
              className="input"
              min={MIN_DATE}
              max={filters.to ?? MAX_DATE}
              value={filters.from ?? ""}
              onChange={(event) => changeFilters({ from: event.target.value || null })}
            />
          </div>
          <div>
            <label htmlFor={`${ids}-to`} className="label">
              ถึงวันที่
            </label>
            <input
              id={`${ids}-to`}
              type="date"
              className="input"
              min={filters.from ?? MIN_DATE}
              max={MAX_DATE}
              value={filters.to ?? ""}
              onChange={(event) => changeFilters({ to: event.target.value || null })}
            />
          </div>
          <div className="col-span-2 md:col-span-1">
            <label htmlFor={`${ids}-sort`} className="label">
              เรียงตาม
            </label>
            <Select
              id={`${ids}-sort`}
              value={filters.sort}
              onChange={(event) => changeFilters({ sort: event.target.value as SortKey })}
            >
              {SORT_KEYS.map((key) => (
                <option key={key} value={key}>
                  {SORT_LABELS[key]}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </section>

      <section className="sheet p-4 sm:p-5" aria-label="ผลลัพธ์">
        {hasAnyTransactions ? (
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-rule-2 pb-3 text-sm">
            <p className="max-w-none" data-testid="result-count" aria-live="polite">
              พบ <span className="fig font-medium">{filtered.length}</span> รายการ
              {active ? ` จากทั้งหมด ${transactions.length} รายการ` : ""}
            </p>
            <dl className="flex flex-wrap gap-x-5 gap-y-1 text-muted">
              <div className="flex gap-2">
                <dt>รายรับ</dt>
                <dd className="fig text-ink">{formatBaht(totals.incomeSatang)}</dd>
              </div>
              <div className="flex gap-2">
                <dt>รายจ่าย</dt>
                <dd className="fig text-ink">{formatBaht(totals.expenseSatang)}</dd>
              </div>
            </dl>
          </div>
        ) : null}

        {!hasAnyTransactions ? (
          <EmptyState
            title="ยังไม่มีรายการ"
            body="รายรับและรายจ่ายที่คุณบันทึกจะแสดงที่นี่ ค้นหา กรอง และส่งออกเป็น CSV ได้"
            action={
              <button type="button" className="btn btn-card" onClick={() => openTransactionForm()}>
                <Plus aria-hidden="true" className="size-4" />
                เพิ่มรายการแรก
              </button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="ไม่พบรายการที่ตรงกับตัวกรอง"
            body="ลองเปลี่ยนคำค้นหา ช่วงวันที่ หรือหมวดหมู่ รายการของคุณยังอยู่ครบ"
            action={
              <button
                type="button"
                className="btn btn-card"
                onClick={() => changeFilters({ ...DEFAULT_FILTERS, sort: filters.sort })}
              >
                ล้างตัวกรอง
              </button>
            }
          />
        ) : (
          <>
            {/* 48rem and up: a table */}
            <table className="ledger hidden md:table">
              <caption className="visually-hidden">รายการรายรับและรายจ่าย</caption>
              <thead>
                <tr>
                  <th scope="col" aria-sort={sortState("date")} className="w-36">
                    <SortButton
                      label="วันที่"
                      state={sortState("date")}
                      onClick={() => toggleSort("date")}
                    />
                  </th>
                  <th scope="col">รายละเอียด</th>
                  <th scope="col">หมวดหมู่</th>
                  <th scope="col" aria-sort={sortState("amount")} className="num">
                    <SortButton
                      label="จำนวนเงิน"
                      state={sortState("amount")}
                      onClick={() => toggleSort("amount")}
                      alignEnd
                    />
                  </th>
                  <th scope="col" className="w-24">
                    <span className="visually-hidden">จัดการ</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((transaction) => {
                  const category = categoryById.get(transaction.categoryId);
                  return (
                    <tr key={transaction.id}>
                      <td className="whitespace-nowrap text-muted">
                        {formatThaiDate(transaction.date)}
                      </td>
                      <td className="max-w-0 w-[45%]">
                        <span
                          className="block truncate font-medium"
                          title={transaction.description}
                        >
                          {transaction.description}
                        </span>
                      </td>
                      <td>
                        {category ? (
                          <span className="flex items-baseline gap-2">
                            <Swatch color={category.color} />
                            <span className="truncate">{category.name}</span>
                          </span>
                        ) : null}
                      </td>
                      <td className="num">
                        <Amount type={transaction.type} satang={transaction.amountSatang} />
                      </td>
                      <td>
                        <RowActions
                          transaction={transaction}
                          onEdit={openTransactionForm}
                          onDelete={requestDelete}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* under 48rem: each row restacked as a labelled block */}
            <ul className="md:hidden">
              {visible.map((transaction) => {
                const category = categoryById.get(transaction.categoryId);
                return (
                  <li
                    key={transaction.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 border-b border-rule py-3 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="break-words font-medium">{transaction.description}</p>
                      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-sm text-muted">
                        <span>{formatThaiDate(transaction.date)}</span>
                        {category ? (
                          <span className="flex min-w-0 items-baseline gap-1.5">
                            <Swatch color={category.color} />
                            <span className="truncate">{category.name}</span>
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div className="grid justify-items-end gap-1">
                      <Amount type={transaction.type} satang={transaction.amountSatang} />
                      <RowActions
                        transaction={transaction}
                        onEdit={openTransactionForm}
                        onDelete={requestDelete}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>

            {filtered.length > visibleCount ? (
              <div className="mt-4 flex justify-center border-t border-rule pt-4">
                <button
                  type="button"
                  className="btn btn-card"
                  onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                >
                  แสดงเพิ่มอีก {Math.min(PAGE_SIZE, filtered.length - visibleCount)} รายการ
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

function SortButton({
  label,
  state,
  onClick,
  alignEnd = false,
}: {
  label: string;
  state: "ascending" | "descending" | "none";
  onClick: () => void;
  alignEnd?: boolean;
}) {
  const Icon = state === "ascending" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-9 items-center gap-1 rounded-input border-0 bg-transparent p-0 font-medium ${
        state === "none" ? "text-muted" : "text-ink"
      } ${alignEnd ? "flex-row-reverse" : ""}`}
    >
      {label}
      <Icon aria-hidden="true" className={`size-3.5 ${state === "none" ? "opacity-0" : ""}`} />
    </button>
  );
}

function RowActions({
  transaction,
  onEdit,
  onDelete,
}: {
  transaction: Transaction;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}) {
  return (
    <span className="flex justify-end gap-1">
      <button
        type="button"
        className="icon-btn"
        onClick={() => onEdit(transaction)}
        aria-label={`แก้ไข ${transaction.description}`}
      >
        <Pencil aria-hidden="true" className="size-4" />
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={() => onDelete(transaction)}
        aria-label={`ลบ ${transaction.description}`}
      >
        <Trash2 aria-hidden="true" className="size-4" />
      </button>
    </span>
  );
}
