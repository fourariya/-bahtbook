import type { Metadata } from "next";
import { Suspense } from "react";

import { DashboardScreen } from "@/components/workspace/dashboard-screen";

export const metadata: Metadata = { title: "ภาพรวม" };

export default function Page() {
  return (
    <Suspense>
      <DashboardScreen />
    </Suspense>
  );
}
