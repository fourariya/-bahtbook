import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "สมัครใช้งาน" };

// Reads the environment at request time, so the setup notice reflects the running server.
export const dynamic = "force-dynamic";

export default function SignUpPage() {
  return (
    <>
      <h1 className="text-2xl">สมัครใช้งาน</h1>
      <p className="mt-1 mb-6 text-sm text-muted">
        สร้างบัญชีเพื่อบันทึกรายการของคุณเอง ข้อมูลของแต่ละบัญชีแยกจากกัน
      </p>
      <AuthForm mode="signup" configured={isSupabaseConfigured()} />
      <p className="mt-6 text-sm text-muted">
        มีบัญชีอยู่แล้วใช่ไหม <Link href="/login">เข้าสู่ระบบ</Link>
      </p>
    </>
  );
}
