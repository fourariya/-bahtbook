import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/workspace/brand-mark";
import { BRAND } from "@/lib/brand";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="desk flex min-h-dvh flex-col">
      <header className="shell flex h-16 items-center">
        <Link
          href="/"
          aria-label={`${BRAND.name} หน้าแรก`}
          className="flex min-h-11 items-center gap-2 text-lg font-semibold tracking-display no-underline"
        >
          <BrandMark />
          {BRAND.name}
        </Link>
      </header>
      <main className="grid flex-1 place-items-center px-4 pt-4 pb-16">
        <div className="sheet w-full max-w-md p-6 sm:p-8">{children}</div>
      </main>
    </div>
  );
}
