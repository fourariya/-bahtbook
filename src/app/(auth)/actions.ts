"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { fieldErrorsOf, loginSchema, safeNextPath, signUpSchema } from "@/lib/finance/validation";
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

export async function logOut(): Promise<void> {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
