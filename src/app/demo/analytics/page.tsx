import type { Metadata } from "next";
import { Suspense } from "react";

import { AnalyticsScreen } from "@/components/workspace/analytics-screen";

export const metadata: Metadata = { title: "วิเคราะห์" };

export default function Page() {
  return (
    <Suspense>
      <AnalyticsScreen />
    </Suspense>
  );
}
