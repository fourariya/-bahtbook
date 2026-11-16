import type { Metadata } from "next";
import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";
import { SIGNUP_CLOSED_MESSAGE, isSignupEnabled } from "@/lib/auth/site";
import { safeNextPath } from "@/lib/finance/validation";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "เข้าสู่ระบบ" };

const NOTICES: Record<string, string> = {
  "link-invalid": "ลิงก์ยืนยันใช้ไม่ได้หรือหมดอายุแล้ว ลองเข้าสู่ระบบ หรือสมัครใหม่เพื่อรับลิงก์อีกครั้ง",
  "password-updated": "ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว เข้าสู่ระบบด้วยรหัสผ่านใหม่ได้เลย",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; notice?: string }>;
}) {
  const { next, notice } = await searchParams;
  const noticeText = notice ? NOTICES[notice] : undefined;

  return (
    <>
      <h1 className="text-2xl">เข้าสู่ระบบ</h1>
      <p className="mt-1 mb-6 text-sm text-muted">กลับไปดูรายรับรายจ่ายของธุรกิจคุณ</p>
      {noticeText ? (
        <p role="status" className="mb-4 border-l-2 border-accent bg-paper-2 px-3 py-2 text-sm">
          {noticeText}
        </p>
      ) : null}
      <AuthForm
        mode="login"
        next={typeof next === "string" ? safeNextPath(next) : undefined}
        configured={isSupabaseConfigured()}
      />
      {isSignupEnabled() ? (
        <p className="mt-6 text-sm text-muted">
          ยังไม่มีบัญชีใช่ไหม{" "}
          <Link href="/signup" className="text-link">
            สมัครใช้งาน
          </Link>{" "}
          หรือ{" "}
          <Link href="/demo" className="text-link">
            ลองใช้ตัวอย่างโดยไม่ต้องสมัคร
          </Link>
        </p>
      ) : (
        <p className="mt-6 text-sm text-muted">
          {SIGNUP_CLOSED_MESSAGE}{" "}
          <Link href="/demo" className="text-link">
            ลองใช้ตัวอย่างได้ทันที
          </Link>
        </p>
      )}
    </>
  );
}
