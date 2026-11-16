import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";
import { SIGNUP_CLOSED_MESSAGE, isSignupEnabled } from "@/lib/auth/site";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "สมัครใช้งาน" };

// Reads the environment at request time, so the setup notice reflects the running server.
export const dynamic = "force-dynamic";

export default function SignUpPage() {
  // Registration is closed: say so, and offer what is available instead of a
  // form that would be refused.
  if (!isSignupEnabled()) {
    return (
      <>
        <h1 className="text-2xl">สมัครใช้งาน</h1>
        <p role="status" className="mt-4 border-l-2 border-accent bg-paper-2 px-3 py-2 text-sm">
          {SIGNUP_CLOSED_MESSAGE}
        </p>
        <p className="mt-4 text-sm text-muted">โหมดตัวอย่างเปิดทุกหน้าจอด้วยข้อมูลสมมติ โดยไม่ต้องมีบัญชี</p>
        <Link href="/demo" className="btn btn-ink btn-lg mt-4 w-full">
          ลองใช้ตัวอย่าง
        </Link>
        <p className="mt-6 text-sm text-muted">
          มีบัญชีอยู่แล้วใช่ไหม{" "}
          <Link href="/login" className="text-link">
            เข้าสู่ระบบ
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl">สมัครใช้งาน</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        สร้างบัญชีเพื่อบันทึกรายการของคุณเอง ข้อมูลของแต่ละบัญชีแยกจากกัน
      </p>
      <AuthForm mode="signup" configured={isSupabaseConfigured()} />
      <p className="mt-6 text-sm text-muted">
        มีบัญชีอยู่แล้วใช่ไหม{" "}
        <Link href="/login" className="text-link">
          เข้าสู่ระบบ
        </Link>
      </p>
    </>
  );
}
