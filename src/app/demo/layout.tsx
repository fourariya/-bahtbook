import type { Metadata } from "next";
import type { ReactNode } from "react";

import { DemoWorkspace } from "@/components/demo/demo-workspace";
import { isSignupEnabled } from "@/lib/auth/site";
import { BRAND } from "@/lib/brand";
import { DEMO_DISPLAY_NAME, buildDemoCategories, buildDemoTransactions } from "@/lib/demo/data";
import { todayInBangkok } from "@/lib/finance/dates";

export const metadata: Metadata = {
  title: { default: "ตัวอย่าง: ภาพรวม", template: `ตัวอย่าง: %s | ${BRAND.name}` },
  // The demo holds only made-up data and is meant to be found.
  robots: { index: true, follow: true },
};

// The sample data is dated relative to today, so this must not be prerendered at build time.
export const dynamic = "force-dynamic";

export default function DemoLayout({ children }: { children: ReactNode }) {
  const today = todayInBangkok();
  const categories = buildDemoCategories();
  const transactions = buildDemoTransactions(today, categories);

  return (
    <DemoWorkspace
      today={today}
      displayName={DEMO_DISPLAY_NAME}
      initial={{ categories, transactions }}
      signupEnabled={isSignupEnabled()}
    >
      {children}
    </DemoWorkspace>
  );
}
