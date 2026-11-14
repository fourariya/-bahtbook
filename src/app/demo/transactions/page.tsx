import type { Metadata } from "next";
import { Suspense } from "react";

import { TransactionsScreen } from "@/components/workspace/transactions-screen";

export const metadata: Metadata = { title: "รายการ" };

export default function Page() {
  return (
    <Suspense>
      <TransactionsScreen />
    </Suspense>
  );
}
