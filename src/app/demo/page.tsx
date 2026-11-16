import type { Metadata } from "next";
import { Suspense } from "react";

import { DashboardScreen } from "@/components/workspace/dashboard-screen";
import { BRAND } from "@/lib/brand";

// A layout's title template does not apply to the page of its own segment, so
// this page states the full demo title itself.
export const metadata: Metadata = { title: { absolute: `ตัวอย่าง: ภาพรวม | ${BRAND.name}` } };

export default function Page() {
  return (
    <Suspense>
      <DashboardScreen />
    </Suspense>
  );
}
