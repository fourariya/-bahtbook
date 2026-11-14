"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState, useTransition, type FormEvent } from "react";

import { Field, Select, Spinner } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { MAX_DATE, MIN_DATE } from "@/lib/finance/dates";
import { satangToDecimalString } from "@/lib/finance/money";
import { TYPE_LABELS, type Transaction, type TransactionType } from "@/lib/finance/types";
import {
  DESCRIPTION_MAX,
  fieldErrorsOf,
  transactionInputSchema,
  type TransactionFormValues,
} from "@/lib/finance/validation";

import { useWorkspace } from "./context";

interface TransactionDialogProps {
  open: boolean;
  /** The transaction being edited, or null to add a new one. */
  transaction: Transaction | null;
  onClose: () => void;
}

const FIELD_ORDER = ["amount", "date", "categoryId", "description"] as const;

export function TransactionDialog({ open, transaction, onClose }: TransactionDialogProps) {
  const titleId = useId();
  return (
    <Modal open={open} onClose={onClose} labelledBy={titleId}>
      <TransactionForm titleId={titleId} transaction={transaction} onClose={onClose} />
    </Modal>
  );
}

function TransactionForm({
  titleId,
  transaction,
  onClose,
}: {
  titleId: string;
  transaction: Transaction | null;
  onClose: () => void;
}) {
  const { categories, today, actions, notify, mode, basePath } = useWorkspace();
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const isEdit = transaction !== null;

  // For a new transaction the id is created once per opened form. Submitting the
  // same form twice reaches the database with the same primary key, so a
  // double click can never create two rows.
  const [values, setValues] = useState<TransactionFormValues>(() => {
    const type: TransactionType = transaction?.type ?? "expense";
    return {
      id: transaction?.id ?? crypto.randomUUID(),
      type,
      amount: transaction ? satangToDecimalString(transaction.amountSatang) : "",
      date: transaction?.date ?? today,
      categoryId: transaction?.categoryId ?? "",
      description: transaction?.description ?? "",
    };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();

  const options = categories.filter((category) => category.type === values.type);

  function validate(next: TransactionFormValues): Record<string, string> {
    const parsed = transactionInputSchema.safeParse(next);
    return parsed.success ? {} : fieldErrorsOf(parsed.error);
  }

  function update(patch: Partial<TransactionFormValues>) {
    const next = { ...values, ...patch };
    setValues(next);
    // After the first attempt, errors follow the input instead of waiting for another submit.
    if (submitted) setErrors(validate(next));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setSubmitted(true);
    setFormError(null);
    const found = validate(values);
    setErrors(found);
    const firstInvalid = FIELD_ORDER.find((name) => found[name]);
    if (firstInvalid) {
      formRef.current?.querySelector<HTMLElement>(`[name="${firstInvalid}"]`)?.focus();
      return;
    }

    startTransition(async () => {
      try {
        const result = await actions.saveTransaction(values, isEdit ? "update" : "create");
        if (result.ok) {
          notify("success", result.message);
          onClose();
          return;
        }
        setFormError(result.message);
        if (result.fieldErrors) setErrors(result.fieldErrors);
      } catch {
        setFormError("เชื่อมต่อไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง");
      }
    });
  }

  const describe = (name: string) => `${formId}-${name}-help`;

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <h2 id={titleId} className="text-xl">
          {isEdit ? "แก้ไขรายการ" : "เพิ่มรายการ"}
        </h2>
        <button type="button" className="icon-btn -mt-1 -mr-2" onClick={onClose} aria-label="ปิด">
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>

      {mode === "demo" ? (
        <p className="mt-2 text-sm text-muted">
          โหมดตัวอย่าง: รายการนี้จะอยู่ในแท็บนี้เท่านั้น ไม่ถูกบันทึกลงฐานข้อมูล
        </p>
      ) : null}

      <fieldset className="mt-5">
        <legend className="label">ประเภท</legend>
        <div className="groove">
          {(["expense", "income"] as const).map((type) => (
            <label key={type}>
              <input
                type="radio"
                name="type"
                value={type}
                checked={values.type === type}
                onChange={() => update({ type, categoryId: "" })}
              />
              {TYPE_LABELS[type]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-5 grid gap-x-4 gap-y-1 sm:grid-cols-2">
        <Field
          id={`${formId}-amount`}
          label="จำนวนเงิน (บาท)"
          error={errors.amount}
          hint="เช่น 1250 หรือ 1,250.50"
        >
          <input
            id={`${formId}-amount`}
            name="amount"
            className="input fig"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={values.amount}
            onChange={(event) => update({ amount: event.target.value })}
            aria-required="true"
            aria-invalid={errors.amount ? "true" : undefined}
            aria-describedby={describe("amount")}
          />
        </Field>

        <Field id={`${formId}-date`} label="วันที่" error={errors.date}>
          <input
            id={`${formId}-date`}
            name="date"
            className="input"
            type="date"
            min={MIN_DATE}
            max={MAX_DATE}
            value={values.date}
            onChange={(event) => update({ date: event.target.value })}
            aria-required="true"
            aria-invalid={errors.date ? "true" : undefined}
            aria-describedby={describe("date")}
          />
        </Field>
      </div>

      <Field
        id={`${formId}-categoryId`}
        label="หมวดหมู่"
        error={errors.categoryId}
        hint={options.length === 0 ? `ยังไม่มีหมวดหมู่สำหรับ${TYPE_LABELS[values.type]}` : undefined}
        className="mt-1"
      >
        <Select
          id={`${formId}-categoryId`}
          name="categoryId"
          value={values.categoryId}
          onChange={(event) => update({ categoryId: event.target.value })}
          aria-required="true"
          aria-invalid={errors.categoryId ? "true" : undefined}
          aria-describedby={describe("categoryId")}
        >
          <option value="">เลือกหมวดหมู่</option>
          {options.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </Field>
      {options.length === 0 ? (
        <p className="-mt-1 mb-2 text-sm">
          <Link href={`${basePath}/categories`} onClick={onClose}>
            ไปที่หน้าหมวดหมู่เพื่อเพิ่มหมวดใหม่
          </Link>
        </p>
      ) : null}

      <Field
        id={`${formId}-description`}
        label="รายละเอียด"
        error={errors.description}
        hint={`${values.description.length}/${DESCRIPTION_MAX} ตัวอักษร`}
        className="mt-1"
      >
        <input
          id={`${formId}-description`}
          name="description"
          className="input"
          type="text"
          autoComplete="off"
          maxLength={DESCRIPTION_MAX}
          placeholder="ค่าโฮสติ้งเว็บไซต์ เดือนพฤศจิกายน"
          value={values.description}
          onChange={(event) => update({ description: event.target.value })}
          aria-required="true"
          aria-invalid={errors.description ? "true" : undefined}
          aria-describedby={describe("description")}
        />
      </Field>

      <p role="alert" className="min-h-[1lh] text-sm text-error">
        {formError}
      </p>

      <div className="mt-3 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" className="btn btn-card" onClick={onClose}>
          ยกเลิก
        </button>
        <button type="submit" className="btn btn-ink min-w-32" disabled={pending}>
          {pending ? <Spinner /> : null}
          {isEdit ? "บันทึกการแก้ไข" : "บันทึกรายการ"}
        </button>
      </div>
    </form>
  );
}
