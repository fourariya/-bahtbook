import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/password-forms";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "ลืมรหัสผ่าน" };

const NOTICES: Record<string, string> = {
  "link-invalid": "ลิงก์ตั้งรหัสผ่านใช้ไม่ได้ หมดอายุ หรือถูกใช้ไปแล้ว กรอกอีเมลเพื่อขอลิงก์ใหม่",
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { notice } = await searchParams;
  const noticeText = typeof notice === "string" ? NOTICES[notice] : undefined;

  return (
    <>
      <h1 className="text-2xl">ลืมรหัสผ่าน</h1>
      <p className="mt-1 mb-6 text-sm text-muted">กรอกอีเมลของบัญชี เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้</p>
      {noticeText ? (
        <p role="status" className="mb-4 border-l-2 border-accent bg-paper-2 px-3 py-2 text-sm">
          {noticeText}
        </p>
      ) : null}
      <ForgotPasswordForm configured={isSupabaseConfigured()} />
      <p className="mt-6 text-sm text-muted">
        จำรหัสผ่านได้แล้วใช่ไหม{" "}
        <Link href="/login" className="text-link">
          กลับไปเข้าสู่ระบบ
        </Link>
      </p>
    </>
  );
}
