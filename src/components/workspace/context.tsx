"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import type {
  ActionResult,
  Category,
  CategoryColor,
  Transaction,
  TransactionType,
} from "@/lib/finance/types";
import type { TransactionFormValues } from "@/lib/finance/validation";

import { ConfirmDeleteDialog } from "./confirm-delete-dialog";
import { TransactionDialog } from "./transaction-dialog";

/**
 * The operations a workspace can perform. The signed-in app passes Server
 * Actions that write to PostgreSQL; the public demo passes in-browser
 * functions that never leave the tab. Screens do not know which one they have.
 */
export interface WorkspaceActions {
  saveTransaction(values: TransactionFormValues, mode: "create" | "update"): Promise<ActionResult>;
  deleteTransaction(id: string): Promise<ActionResult>;
  createCategory(values: {
    name: string;
    type: TransactionType;
    color: CategoryColor;
  }): Promise<ActionResult>;
  updateCategory(values: { id: string; name: string; color: CategoryColor }): Promise<ActionResult>;
  deleteCategory(id: string): Promise<ActionResult>;
}

export interface WorkspaceData {
  mode: "live" | "demo";
  /** "/app" or "/demo" */
  basePath: string;
  /** Today in Asia/Bangkok, `YYYY-MM-DD`, decided on the server. */
  today: string;
  displayName: string;
  categories: Category[];
  transactions: Transaction[];
  actions: WorkspaceActions;
}

export interface Notice {
  id: number;
  tone: "success" | "error";
  message: string;
}

interface WorkspaceValue extends WorkspaceData {
  notice: Notice | null;
  notify: (tone: Notice["tone"], message: string) => void;
  dismissNotice: () => void;
  openTransactionForm: (transaction?: Transaction) => void;
  requestDelete: (transaction: Transaction) => void;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside <WorkspaceProvider>.");
  return value;
}

/**
 * `key` changes only when the form is opened, never when it closes. Closing has
 * to go through the same <dialog> element so the browser can close it properly
 * and return focus to the button that opened it.
 */
interface Editor {
  key: number;
  open: boolean;
  transaction: Transaction | null;
}

export function WorkspaceProvider({ children, ...data }: WorkspaceData & { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [editor, setEditor] = useState<Editor>({ key: 0, open: false, transaction: null });
  const [deleting, setDeleting] = useState<Transaction | null>(null);

  const notify = useCallback((tone: Notice["tone"], message: string) => {
    setNotice((previous) => ({ id: (previous?.id ?? 0) + 1, tone, message }));
  }, []);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const openTransactionForm = useCallback((transaction?: Transaction) => {
    setEditor((previous) => ({
      key: previous.key + 1,
      open: true,
      transaction: transaction ?? null,
    }));
  }, []);
  const requestDelete = useCallback((transaction: Transaction) => setDeleting(transaction), []);

  const { mode, basePath, today, displayName, categories, transactions, actions } = data;
  const value = useMemo<WorkspaceValue>(
    () => ({
      mode,
      basePath,
      today,
      displayName,
      categories,
      transactions,
      actions,
      notice,
      notify,
      dismissNotice,
      openTransactionForm,
      requestDelete,
    }),
    [
      mode,
      basePath,
      today,
      displayName,
      categories,
      transactions,
      actions,
      notice,
      notify,
      dismissNotice,
      openTransactionForm,
      requestDelete,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
      <TransactionDialog
        key={editor.key}
        open={editor.open}
        transaction={editor.transaction}
        onClose={() => setEditor((previous) => ({ ...previous, open: false }))}
      />
      <ConfirmDeleteDialog transaction={deleting} onClose={() => setDeleting(null)} />
    </WorkspaceContext.Provider>
  );
}
