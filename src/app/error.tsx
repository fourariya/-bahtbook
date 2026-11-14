"use client";

import Link from "next/link";

/** What broke and what to do. Technical details stay in the server log. */
export default function WorkspaceError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="shell grid min-h-dvh place-items-center py-12">
      <div className="sheet max-w-lg p-7">
        <h1 className="text-xl">โหลดข้อมูลไม่สำเร็จ</h1>
        <p className="mt-2 text-sm text-muted">
          ระบบติดต่อฐานข้อมูลไม่ได้ในขณะนี้ ข้อมูลของคุณไม่ได้เปลี่ยนแปลง ลองโหลดอีกครั้ง หากยังไม่ได้
          ให้ออกจากระบบแล้วเข้าใหม่
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" className="btn btn-ink" onClick={reset}>
            ลองอีกครั้ง
          </button>
          <Link href="/" className="btn btn-card">
            กลับหน้าแรก
          </Link>
        </div>
      </div>
    </main>
  );
}
