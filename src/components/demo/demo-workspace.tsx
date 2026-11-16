"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

import { WorkspaceProvider, type WorkspaceActions } from "@/components/workspace/context";
import { Shell } from "@/components/workspace/shell";
import { createDemoStore, type DemoState } from "@/lib/demo/store";

interface DemoWorkspaceProps {
  today: string;
  displayName: string;
  initial: DemoState;
  /** Whether to offer registration from the demo banner. */
  signupEnabled: boolean;
  children: ReactNode;
}

/** The public demo: the real screens, backed by an in-tab store instead of the database. */
export function DemoWorkspace({
  today,
  displayName,
  initial,
  signupEnabled,
  children,
}: DemoWorkspaceProps) {
  const [store] = useState(() => createDemoStore(initial));
  const state = useSyncExternalStore(store.subscribe, store.getState, () => initial);

  const actions = useMemo<WorkspaceActions>(
    () => ({
      saveTransaction: store.saveTransaction,
      deleteTransaction: store.deleteTransaction,
      createCategory: store.createCategory,
      updateCategory: store.updateCategory,
      deleteCategory: store.deleteCategory,
    }),
    [store],
  );

  const isSample = state.transactions === initial.transactions;

  return (
    <WorkspaceProvider
      mode="demo"
      basePath="/demo"
      today={today}
      displayName={displayName}
      categories={state.categories}
      transactions={state.transactions}
      actions={actions}
    >
      <Shell
        banner={
          <DemoBanner
            isEmpty={state.transactions.length === 0}
            isSample={isSample}
            signupEnabled={signupEnabled}
            onStartEmpty={() => store.replace({ categories: initial.categories, transactions: [] })}
            onRestore={() => store.replace(initial)}
          />
        }
      >
        {children}
      </Shell>
    </WorkspaceProvider>
  );
}

interface DemoBannerProps {
  isEmpty: boolean;
  isSample: boolean;
  signupEnabled: boolean;
  onStartEmpty: () => void;
  onRestore: () => void;
}

/**
 * Says plainly that this is sample data that is never saved, and lets a visitor
 * switch between the filled sample workspace and an empty one, which is what a
 * newly registered account looks like.
 */
export function DemoBanner({
  isEmpty,
  isSample,
  signupEnabled,
  onStartEmpty,
  onRestore,
}: DemoBannerProps) {
  const linkClass =
    "inline-flex min-h-11 items-center border-0 bg-transparent p-0 font-medium whitespace-nowrap text-board-type underline decoration-board-muted underline-offset-4";

  return (
    <div className="board">
      <div className="shell flex flex-wrap items-center gap-x-5 gap-y-0 py-1 text-sm">
        <p className="max-w-none py-1.5">
          <strong className="font-semibold">โหมดตัวอย่าง</strong> ข้อมูลทั้งหมดเป็นข้อมูลสมมติ{" "}
          <span className="hidden sm:inline">การเพิ่มหรือแก้ไขอยู่ในแท็บนี้เท่านั้น </span>
          ไม่ถูกบันทึกลงฐานข้อมูล
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-x-5">
          {isEmpty || !isSample ? (
            <button type="button" className={linkClass} onClick={onRestore}>
              คืนค่าข้อมูลตัวอย่าง
            </button>
          ) : null}
          {!isEmpty ? (
            <button type="button" className={linkClass} onClick={onStartEmpty}>
              เริ่มจากบัญชีว่าง
            </button>
          ) : null}
          {signupEnabled ? (
            <Link href="/signup" className={linkClass}>
              สมัครเพื่อใช้งานจริง
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
