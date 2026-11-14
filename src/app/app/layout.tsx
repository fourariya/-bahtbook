import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { logOut } from "@/app/(auth)/actions";
import { WorkspaceProvider } from "@/components/workspace/context";
import { LogoutButton, Shell } from "@/components/workspace/shell";
import { WorkspaceSkeleton } from "@/components/workspace/skeleton";
import { todayInBangkok } from "@/lib/finance/dates";
import { fetchCategories, fetchDisplayName, fetchTransactions } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/server";

import {
  createCategory,
  deleteCategory,
  deleteTransaction,
  saveTransaction,
  updateCategory,
} from "./actions";

// Always rendered per request: it depends on the session cookie, and must never be
// prerendered as a static redirect when the build runs without Supabase settings.
export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      <Workspace>{children}</Workspace>
    </Suspense>
  );
}

/**
 * The signed-in workspace. The user is verified with the Auth server here (not
 * only in the proxy), and all data is loaded through the user's own session,
 * so Row Level Security decides what comes back.
 */
async function Workspace({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  if (!supabase) redirect("/login");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [categories, transactions, displayName] = await Promise.all([
    fetchCategories(supabase),
    fetchTransactions(supabase),
    fetchDisplayName(supabase, user.id),
  ]);

  return (
    <WorkspaceProvider
      mode="live"
      basePath="/app"
      today={todayInBangkok()}
      displayName={displayName ?? user.email ?? "บัญชีของฉัน"}
      categories={categories}
      transactions={transactions}
      actions={{
        saveTransaction,
        deleteTransaction,
        createCategory,
        updateCategory,
        deleteCategory,
      }}
    >
      <Shell accountSlot={<LogoutButton action={logOut} />}>{children}</Shell>
    </WorkspaceProvider>
  );
}
