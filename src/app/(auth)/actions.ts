"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  PASSWORD_UPDATE_MESSAGES,
  RECOVERY_REQUESTED_MESSAGE,
  passwordUpdateFailure,
  sendRecoveryEmail,
} from "@/lib/auth/password-reset";
import {
  fieldErrorsOf,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  safeNextPath,
  signUpSchema,
} from "@/lib/finance/validation";
import { clearRecoveryMarker, hasRecoverySession } from "@/lib/supabase/recovery";
import { createClient } from "@/lib/supabase/server";

export interface AuthFormState {
  status: "idle" | "error" | "check-email";
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Echoed back so the form keeps what was typed. Never includes the password. */
  values?: { email?: string; displayName?: string };
}

const NOT_CONFIGURED = "ระบบสมาชิกยังไม่พร้อมใช้งาน เพราะยังไม่ได้เชื่อมต่อ Supabase (ดูขั้นตอนใน README)";

/** Maps Supabase Auth error codes to messages that are safe to show. */
function authErrorMessage(code: string | undefined, status: number | undefined): string {
  switch (code) {
    case "invalid_credentials":
      return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
    case "email_not_confirmed":
      return "ยังไม่ได้ยืนยันอีเมล กรุณากดลิงก์ในอีเมลที่ส่งให้ก่อนเข้าสู่ระบบ";
    case "weak_password":
      return "รหัสผ่านคาดเดาง่ายเกินไป กรุณาตั้งรหัสผ่านที่ยาวและซับซ้อนขึ้น";
    case "signup_disabled":
      return "ขณะนี้ปิดรับสมัครสมาชิกใหม่";
    case "email_address_invalid":
      return "อีเมลนี้ใช้สมัครไม่ได้ กรุณาใช้อีเมลอื่น";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "มีการส่งคำขอถี่เกินไป กรุณารอสักครู่แล้วลองใหม่";
    default:
      return status === 429
        ? "มีการส่งคำขอถี่เกินไป กรุณารอสักครู่แล้วลองใหม่"
        : "ดำเนินการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
  }
}

async function siteOrigin(): Promise<string> {
  const configured = process.env.SITE_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}

export async function logIn(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  const parsed = loginSchema.safeParse({ email, password: formData.get("password") });
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsOf(parsed.error), values: { email } };
  }

  const supabase = await createClient();
  if (!supabase) return { status: "error", message: NOT_CONFIGURED, values: { email } };

  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return {
      status: "error",
      message: authErrorMessage(error.code, error.status),
      values: { email },
    };
  }

  revalidatePath("/", "layout");
  redirect(safeNextPath(String(formData.get("next") ?? "")));
}

export async function signUp(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  const displayName = String(formData.get("displayName") ?? "");
  const values = { email, displayName };

  const parsed = signUpSchema.safeParse({
    displayName,
    email,
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsOf(parsed.error), values };
  }

  const supabase = await createClient();
  if (!supabase) return { status: "error", message: NOT_CONFIGURED, values };

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${await siteOrigin()}/auth/confirm`,
    },
  });
  if (error) {
    return { status: "error", message: authErrorMessage(error.code, error.status), values };
  }

  if (data.session) {
    // Email confirmation is switched off in this Supabase project.
    revalidatePath("/", "layout");
    redirect("/app");
  }

  // Shown whether or not the address was already registered, so the form
  // cannot be used to find out which emails have accounts.
  return {
    status: "check-email",
    message: `เราส่งลิงก์ยืนยันไปที่ ${parsed.data.email} แล้ว กดลิงก์ในอีเมลเพื่อเริ่มใช้งาน`,
  };
}

export interface PasswordFormState {
  status: "idle" | "error" | "sent" | "expired";
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Echoed back so the form keeps what was typed. Never includes a password. */
  values?: { email?: string };
}

/**
 * The address the recovery link may return to. SITE_URL is used when it is
 * set. Without it, the request's own host is trusted only on a developer's
 * machine; anywhere else no address is sent and Supabase falls back to the
 * Site URL configured in the project, so a forged Host header can never end
 * up inside a recovery email.
 */
async function recoveryRedirect(): Promise<string | undefined> {
  const configured = process.env.SITE_URL?.trim().replace(/\/+$/, "");
  if (configured) return `${configured}/auth/confirm`;
  const origin = await siteOrigin();
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
    ? `${origin}/auth/confirm`
    : undefined;
}

/** Step 1 of password recovery: ask for the email. The answer never reveals whether an account exists. */
export async function requestPasswordReset(
  _previous: PasswordFormState,
  formData: FormData,
): Promise<PasswordFormState> {
  const email = String(formData.get("email") ?? "");
  const parsed = forgotPasswordSchema.safeParse({ email });
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsOf(parsed.error), values: { email } };
  }

  const supabase = await createClient();
  if (!supabase) return { status: "error", message: NOT_CONFIGURED, values: { email } };

  await sendRecoveryEmail(supabase.auth, parsed.data.email, await recoveryRedirect(), (code) => {
    // The code only. Never the address, so the log cannot be used to list accounts.
    console.error("[auth] recovery email request was not completed", { code });
  });

  return { status: "sent", message: RECOVERY_REQUESTED_MESSAGE };
}

/**
 * Step 3 of password recovery: set the new password. Allowed only for a
 * session started by the emailed link a few minutes ago. Afterwards every
 * session of the account is ended and the user logs in with the new password.
 */
export async function updatePassword(
  _previous: PasswordFormState,
  formData: FormData,
): Promise<PasswordFormState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsOf(parsed.error) };

  const supabase = await createClient();
  if (!supabase) return { status: "error", message: NOT_CONFIGURED };

  if (!(await hasRecoverySession(supabase))) {
    await clearRecoveryMarker();
    return { status: "expired", message: PASSWORD_UPDATE_MESSAGES.expired };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    const reason = passwordUpdateFailure(error);
    console.error("[auth] password update failed", { code: error.code ?? "unknown" });
    if (reason === "expired")
      return { status: "expired", message: PASSWORD_UPDATE_MESSAGES.expired };
    return reason === "same" || reason === "weak"
      ? { status: "error", fieldErrors: { password: PASSWORD_UPDATE_MESSAGES[reason] } }
      : { status: "error", message: PASSWORD_UPDATE_MESSAGES[reason] };
  }

  // Ends this recovery session and any other session, on every device.
  await supabase.auth.signOut({ scope: "global" });
  await clearRecoveryMarker();
  revalidatePath("/", "layout");
  redirect("/login?notice=password-updated");
}

/**
 * Ends the session in this browser only. Other devices stay signed in; ending
 * every session is reserved for a password change (see updatePassword).
 */
export async function logOut(): Promise<void> {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut({ scope: "local" });
  await clearRecoveryMarker();
  revalidatePath("/", "layout");
  redirect("/login");
}
