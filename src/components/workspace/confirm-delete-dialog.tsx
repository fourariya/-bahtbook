"use client";

import { useId, useState, useTransition } from "react";

import { Modal } from "@/components/ui/modal";
import { Amount, Spinner } from "@/components/ui/primitives";
import { formatThaiDate } from "@/lib/finance/dates";
import type { Transaction } from "@/lib/finance/types";

import { useWorkspace } from "./context";

interface ConfirmDeleteDialogProps {
  transaction: Transaction | null;
  onClose: () => void;
}

/** Deleting a transaction cannot be undone, so it is confirmed first. */
export function ConfirmDeleteDialog({ transaction, onClose }: ConfirmDeleteDialogProps) {
  const titleId = useId();
  const bodyId = useId();
  return (
    <Modal open={transaction !== null} onClose={onClose} labelledBy={titleId} describedBy={bodyId}>
      {transaction ? (
        <ConfirmDeleteBody
          key={transaction.id}
          titleId={titleId}
          bodyId={bodyId}
          transaction={transaction}
          onClose={onClose}
        />
      ) : null}
    </Modal>
  );
}

function ConfirmDeleteBody({
  titleId,
  bodyId,
  transaction,
  onClose,
}: {
  titleId: string;
  bodyId: string;
  transaction: Transaction;
  onClose: () => void;
}) {
  const { actions, notify } = useWorkspace();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await actions.deleteTransaction(transaction.id);
        if (result.ok) {
          notify("success", result.message);
          onClose();
        } else {
          setError(result.message);
        }
      } catch {
        setError("เชื่อมต่อไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง");
      }
    });
  }

  return (
    <div className="p-5 sm:p-6">
      <h2 id={titleId} className="text-xl">
        ลบรายการนี้หรือไม่
      </h2>
      <div id={bodyId}>
        <p className="mt-2 text-sm text-muted">เมื่อลบแล้วจะกู้คืนไม่ได้ และยอดสรุปจะคำนวณใหม่ทันที</p>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-y border-rule py-3 text-sm">
          <dt className="text-muted">รายละเอียด</dt>
          <dd className="min-w-0 break-words">{transaction.description}</dd>
          <dt className="text-muted">วันที่</dt>
          <dd>{formatThaiDate(transaction.date)}</dd>
          <dt className="text-muted">จำนวนเงิน</dt>
          <dd>
            <Amount type={transaction.type} satang={transaction.amountSatang} />
          </dd>
        </dl>
      </div>
      <p role="alert" className="mt-2 min-h-[1lh] text-sm text-error">
        {error}
      </p>
      <div className="mt-3 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" className="btn btn-card" onClick={onClose} autoFocus>
          ยกเลิก
        </button>
        <button
          type="button"
          className="btn btn-danger min-w-28"
          onClick={confirm}
          disabled={pending}
        >
          {pending ? <Spinner /> : null}
          ลบรายการ
        </button>
      </div>
    </div>
  );
}
