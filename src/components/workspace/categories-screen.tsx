"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useId, useMemo, useRef, useState, useTransition, type FormEvent } from "react";

import { CATEGORY_COLOR_LABELS, Field, Select, Spinner, Swatch } from "@/components/ui/primitives";
import { usageByCategory } from "@/lib/finance/aggregate";
import {
  CATEGORY_COLORS,
  TYPE_LABELS,
  type Category,
  type CategoryColor,
  type TransactionType,
} from "@/lib/finance/types";
import { CATEGORY_NAME_MAX } from "@/lib/finance/validation";

import { useWorkspace } from "./context";

const CONNECTION_ERROR = "เชื่อมต่อไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง";

export function CategoriesScreen() {
  const { categories, transactions } = useWorkspace();
  const usage = useMemo(() => usageByCategory(transactions), [transactions]);

  return (
    <div className="grid grid-cols-1 gap-6">
      <div>
        <h1 className="text-2xl">หมวดหมู่</h1>
        <p className="mt-1 text-sm text-muted">
          จัดกลุ่มรายรับและรายจ่ายตามแบบของธุรกิจคุณ หมวดที่มีรายการใช้อยู่จะลบไม่ได้
        </p>
      </div>

      <AddCategoryForm />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {(["expense", "income"] as const).map((type) => {
          const list = categories.filter((category) => category.type === type);
          return (
            <section key={type} className="sheet p-5 sm:p-6" aria-labelledby={`categories-${type}`}>
              <h2 id={`categories-${type}`} className="text-lg">
                หมวดหมู่{TYPE_LABELS[type]}
              </h2>
              {list.length === 0 ? (
                <p className="mt-3 text-sm text-muted">
                  ยังไม่มีหมวดหมู่{TYPE_LABELS[type]} เพิ่มหมวดแรกจากแบบฟอร์มด้านบน
                </p>
              ) : (
                <ul className="mt-2">
                  {list.map((category) => (
                    <CategoryRow
                      key={category.id}
                      category={category}
                      usageCount={usage.get(category.id) ?? 0}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ColorSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: CategoryColor;
  onChange: (color: CategoryColor) => void;
}) {
  return (
    <span className="flex items-center gap-2">
      <Swatch color={value} className="size-4" />
      <Select
        id={id}
        className="flex-1"
        value={value}
        onChange={(event) => onChange(event.target.value as CategoryColor)}
      >
        {CATEGORY_COLORS.map((color) => (
          <option key={color} value={color}>
            {CATEGORY_COLOR_LABELS[color]}
          </option>
        ))}
      </Select>
    </span>
  );
}

function AddCategoryForm() {
  const { actions, notify } = useWorkspace();
  const ids = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<TransactionType>("expense");
  const [color, setColor] = useState<CategoryColor>("clay");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!name.trim()) {
      setError("กรอกชื่อหมวดหมู่");
      nameRef.current?.focus();
      return;
    }
    setError(undefined);
    startTransition(async () => {
      try {
        const result = await actions.createCategory({ name, type, color });
        if (result.ok) {
          notify("success", result.message);
          setName("");
        } else {
          setError(result.fieldErrors?.name ?? result.message);
          nameRef.current?.focus();
        }
      } catch {
        setError(CONNECTION_ERROR);
      }
    });
  }

  return (
    <section className="sheet p-5 sm:p-6" aria-labelledby={`${ids}-title`}>
      <h2 id={`${ids}-title`} className="text-lg">
        เพิ่มหมวดหมู่ใหม่
      </h2>
      <form
        onSubmit={handleSubmit}
        noValidate
        className="mt-4 grid items-start gap-x-4 gap-y-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_auto]"
      >
        <Field id={`${ids}-name`} label="ชื่อหมวดหมู่" error={error}>
          <input
            ref={nameRef}
            id={`${ids}-name`}
            name="name"
            className="input"
            type="text"
            autoComplete="off"
            maxLength={CATEGORY_NAME_MAX}
            placeholder="ค่าอบรมและสัมมนา"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-required="true"
            aria-invalid={error ? "true" : undefined}
            aria-describedby={`${ids}-name-help`}
          />
        </Field>
        <fieldset>
          <legend className="label">ประเภท</legend>
          <div className="groove">
            {(["expense", "income"] as const).map((option) => (
              <label key={option}>
                <input
                  type="radio"
                  name="category-type"
                  value={option}
                  checked={type === option}
                  onChange={() => setType(option)}
                />
                {TYPE_LABELS[option]}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor={`${ids}-color`} className="label">
            สี
          </label>
          <ColorSelect id={`${ids}-color`} value={color} onChange={setColor} />
        </div>
        <div className="mt-4 md:mt-[calc(1.65*var(--text-sm)+6px)]">
          <button type="submit" className="btn btn-card w-full md:w-auto" disabled={pending}>
            {pending ? <Spinner /> : null}
            เพิ่มหมวดหมู่
          </button>
        </div>
      </form>
    </section>
  );
}

function CategoryRow({ category, usageCount }: { category: Category; usageCount: number }) {
  const { actions, notify } = useWorkspace();
  const ids = useId();
  const [view, setView] = useState<"read" | "edit" | "confirm-delete">("read");
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState<CategoryColor>(category.color);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const inUse = usageCount > 0;

  function startEditing() {
    setName(category.name);
    setColor(category.color);
    setError(undefined);
    setView("edit");
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!name.trim()) {
      setError("กรอกชื่อหมวดหมู่");
      return;
    }
    setError(undefined);
    startTransition(async () => {
      try {
        const result = await actions.updateCategory({ id: category.id, name, color });
        if (result.ok) {
          notify("success", result.message);
          setView("read");
        } else {
          setError(result.fieldErrors?.name ?? result.message);
        }
      } catch {
        setError(CONNECTION_ERROR);
      }
    });
  }

  function remove() {
    if (pending) return;
    startTransition(async () => {
      try {
        const result = await actions.deleteCategory(category.id);
        notify(result.ok ? "success" : "error", result.message);
        if (!result.ok) setView("read");
      } catch {
        notify("error", CONNECTION_ERROR);
        setView("read");
      }
    });
  }

  if (view === "edit") {
    return (
      <li className="border-b border-rule py-3 last:border-b-0">
        <form onSubmit={save} noValidate className="grid gap-x-3 gap-y-1 sm:grid-cols-2">
          <Field id={`${ids}-name`} label="ชื่อหมวดหมู่" error={error}>
            <input
              id={`${ids}-name`}
              className="input"
              type="text"
              autoComplete="off"
              autoFocus
              maxLength={CATEGORY_NAME_MAX}
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-required="true"
              aria-invalid={error ? "true" : undefined}
              aria-describedby={`${ids}-name-help`}
            />
          </Field>
          <div>
            <label htmlFor={`${ids}-color`} className="label">
              สี
            </label>
            <ColorSelect id={`${ids}-color`} value={color} onChange={setColor} />
          </div>
          <div className="flex gap-2 sm:col-span-2 sm:justify-end">
            <button type="button" className="btn btn-quiet" onClick={() => setView("read")}>
              ยกเลิก
            </button>
            <button type="submit" className="btn btn-card" disabled={pending}>
              {pending ? <Spinner /> : null}
              บันทึก
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="border-b border-rule py-2 last:border-b-0">
      <div className="flex items-center gap-3">
        <Swatch color={category.color} className="size-3" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{category.name}</p>
          <p className="text-sm text-muted">
            {inUse ? `ใช้อยู่ ${usageCount} รายการ` : "ยังไม่มีรายการใช้หมวดนี้"}
          </p>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={startEditing}
          aria-label={`แก้ไขหมวดหมู่ ${category.name}`}
        >
          <Pencil aria-hidden="true" className="size-4" />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setView("confirm-delete")}
          disabled={inUse}
          aria-label={
            inUse ? `ลบหมวดหมู่ ${category.name} ไม่ได้ เพราะมีรายการใช้อยู่` : `ลบหมวดหมู่ ${category.name}`
          }
          title={inUse ? "ลบไม่ได้ เพราะมีรายการใช้อยู่" : undefined}
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </button>
      </div>
      {view === "confirm-delete" ? (
        <div
          role="group"
          aria-label={`ยืนยันการลบหมวดหมู่ ${category.name}`}
          className="mt-2 flex flex-wrap items-center justify-between gap-3 bg-paper-2 px-3 py-2 text-sm"
        >
          <p className="max-w-none">ลบหมวดหมู่นี้ถาวรหรือไม่</p>
          <span className="flex gap-2">
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => setView("read")}
              autoFocus
            >
              ยกเลิก
            </button>
            <button type="button" className="btn btn-danger" onClick={remove} disabled={pending}>
              {pending ? <Spinner /> : null}
              ลบหมวดหมู่
            </button>
          </span>
        </div>
      ) : null}
    </li>
  );
}
