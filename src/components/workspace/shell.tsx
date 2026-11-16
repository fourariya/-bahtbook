"use client";

import { ChartColumn, LayoutDashboard, LogOut, Plus, ReceiptText, Tags, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { BRAND } from "@/lib/brand";

import { BrandMark } from "./brand-mark";
import { useWorkspace } from "./context";

const DESTINATIONS = [
  { path: "", label: "ภาพรวม", icon: LayoutDashboard },
  { path: "/transactions", label: "รายการ", icon: ReceiptText },
  { path: "/analytics", label: "วิเคราะห์", icon: ChartColumn },
  { path: "/categories", label: "หมวดหมู่", icon: Tags },
] as const;

interface ShellProps {
  children: ReactNode;
  /** Sign-out control for the signed-in app. The demo has none. */
  accountSlot?: ReactNode;
  /** Shown above the header. The demo uses it to say that nothing is saved. */
  banner?: ReactNode;
}

export function Shell({ children, accountSlot, banner }: ShellProps) {
  const { basePath, displayName, openTransactionForm } = useWorkspace();
  const pathname = usePathname();
  const isCurrent = (path: string) => pathname === `${basePath}${path}`;

  return (
    <div className="flex min-h-dvh flex-col pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
      <a
        href="#main"
        className="btn btn-ink absolute top-2 left-2 z-(--z-modal) -translate-y-20 focus-visible:translate-y-0"
      >
        ข้ามไปยังเนื้อหา
      </a>

      {banner}

      <header className="sticky top-0 z-(--z-sticky-nav) border-b border-rule bg-paper">
        <div className="shell @container flex h-16 items-center gap-2 md:gap-6">
          <Link
            href={basePath}
            aria-label={`${BRAND.name} หน้าภาพรวม`}
            className="flex min-h-11 items-center gap-2 text-lg font-semibold tracking-display no-underline"
          >
            <BrandMark />
            {BRAND.name}
          </Link>

          <nav aria-label="เมนูหลัก" className="hidden md:flex">
            {DESTINATIONS.map(({ path, label }) => (
              <Link
                key={path}
                href={`${basePath}${path}`}
                className="nav-link"
                aria-current={isCurrent(path) ? "page" : undefined}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 md:gap-3">
            <span
              className="hidden max-w-72 truncate text-sm text-muted lg:block"
              title={displayName}
            >
              {displayName}
            </span>
            {accountSlot}
            <button
              type="button"
              className="btn btn-ink"
              onClick={() => openTransactionForm()}
              aria-label="เพิ่มรายการ"
            >
              <Plus aria-hidden="true" className="size-4" />
              {/* When the bar is too narrow for the label (large text on a small phone), the icon stands alone. */}
              <span className="hidden @[19.5rem]:inline">เพิ่มรายการ</span>
            </button>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="shell flex-1 pt-6 pb-12 outline-none md:pt-8">
        <NoticeBar />
        {children}
      </main>

      <nav
        aria-label="เมนูหลัก"
        className="fixed inset-x-0 bottom-0 z-(--z-sticky-nav) grid grid-cols-4 border-t border-rule bg-paper pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {DESTINATIONS.map(({ path, label, icon: Icon }) => (
          <Link
            key={path}
            href={`${basePath}${path}`}
            className="tab-link"
            aria-current={isCurrent(path) ? "page" : undefined}
          >
            <Icon aria-hidden="true" className="size-5" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** The result of the last action, stated in the page instead of a floating toast. */
function NoticeBar() {
  const { notice, dismissNotice } = useWorkspace();

  useEffect(() => {
    if (!notice || notice.tone !== "success") return;
    const timer = window.setTimeout(dismissNotice, 8000);
    return () => window.clearTimeout(timer);
  }, [notice, dismissNotice]);

  return (
    <div role="status" aria-live="polite">
      {notice ? (
        <div
          className={`mb-5 flex items-center justify-between gap-3 border-l-2 bg-paper-2 py-2 pr-2 pl-3 text-sm ${
            notice.tone === "error" ? "border-error text-error" : "border-success text-ink"
          }`}
        >
          <p className="max-w-none">{notice.message}</p>
          <button type="button" className="icon-btn" onClick={dismissNotice} aria-label="ปิดข้อความ">
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function LogoutButton({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <button type="submit" className="icon-btn" aria-label="ออกจากระบบ" title="ออกจากระบบ">
        <LogOut aria-hidden="true" className="size-5" />
      </button>
    </form>
  );
}
