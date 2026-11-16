import type { Metadata } from "next";

import { RecoveryLinkExpired, ResetPasswordForm } from "@/components/auth/password-forms";
import { hasRecoverySession } from "@/lib/supabase/recovery";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "ตั้งรหัสผ่านใหม่" };

// Depends on the visitor's session, so it is never prerendered or cached.
export const dynamic = "force-dynamic";

/**
 * Step 3 of password recovery. The form is shown only to a visitor whose
 * session was started by the emailed link a few minutes ago. Everyone else,
 * including someone who is merely logged in, is told to request a new link.
 * The Server Action behind the form makes the same check again.
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const allowed = supabase ? await hasRecoverySession(supabase) : false;

  return (
    <>
      <h1 className="text-2xl">ตั้งรหัสผ่านใหม่</h1>
      {allowed ? (
        <>
          <p className="mt-1 mb-6 text-sm text-muted">
            เลือกรหัสผ่านใหม่สำหรับบัญชีของคุณ หลังบันทึกแล้ว ทุกอุปกรณ์ที่เข้าสู่ระบบอยู่จะถูกออกจากระบบ
          </p>
          <ResetPasswordForm />
        </>
      ) : (
        <div className="mt-4">
          <RecoveryLinkExpired />
        </div>
      )}
    </>
  );
}
