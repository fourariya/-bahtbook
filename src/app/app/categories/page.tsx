import type { Metadata } from "next";
import { Suspense } from "react";

import { CategoriesScreen } from "@/components/workspace/categories-screen";

export const metadata: Metadata = { title: "หมวดหมู่" };

export default function Page() {
  return (
    <Suspense>
      <CategoriesScreen />
    </Suspense>
  );
}
