"use client";

import Link from "next/link";
import { useActionState, useState, type FormEvent } from "react";

import { logIn, signUp, type AuthFormState } from "@/app/(auth)/actions";
import { Field, Spinner } from "@/components/ui/primitives";
import {
  DISPLAY_NAME_MAX,
  PASSWORD_MAX,
  PASSWORD_MIN,
  fieldErrorsOf,
  loginSchema,
  signUpSchema,
} from "@/lib/finance/validation";

interface AuthFormProps {
  mode: "login" | "signup";
  /** Where to go after logging in. Validated again on the server. */
  next?: string;
  /** False when Supabase has not been connected yet. */
  configured: boolean;
}

const INITIAL: AuthFormState = { status: "idle" };

export function AuthForm({ mode, next, configured }: AuthFormProps) {
  const isLogin = mode === "login";
  const [state, formAction, pending] = useActionState(isLogin ? logIn : signUp, INITIAL);
  const [clientErrors, setClientErrors] = useState<Record<string, string> | null>(null);

  // The same schema runs here for instant feedback and again on the server.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const parsed = (isLogin ? loginSchema : signUpSchema).safeParse(data);
    if (parsed.success) {
      setClientErrors(null);
      return;
    }
    event.preventDefault();
    const errors = fieldErrorsOf(parsed.error);
    setClientErrors(errors);
    const first = ["displayName", "email", "password"].find((name) => errors[name]);
    if (first) form.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
  }

  const errors = clientErrors ?? state.fieldErrors ?? {};

  if (state.status === "check-email") {
    return (
      <div role="status">
        <h2 className="text-lg">ตรวจสอบอีเมลของคุณ</h2>
        <p className="mt-2 text-sm text-ink-2">{state.message}</p>
        <p className="mt-4 text-sm text-muted">
          ไม่พบอีเมลใช่ไหม ลองดูในโฟลเดอร์สแปม หากเคยสมัครด้วยอีเมลนี้แล้ว ให้
          <Link href="/login" className="text-link">
            เข้าสู่ระบบ
          </Link>
          แทน
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {!configured ? (
        <p className="mb-4 border-l-2 border-accent bg-paper-2 px-3 py-2 text-sm">
          ระบบสมาชิกยังไม่ได้เชื่อมต่อกับ Supabase ในเครื่องนี้ จึงยังสมัครหรือเข้าสู่ระบบไม่ได้ ดูขั้นตอนตั้งค่าใน README หรือ
          <Link href="/demo" className="text-link">
            ลองใช้ตัวอย่าง
          </Link>
          ได้ทันที
        </p>
      ) : null}

      {!isLogin ? (
        <Field id="displayName" label="ชื่อที่ใช้แสดง" error={errors.displayName} hint="ชื่อคุณหรือชื่อธุรกิจ">
          <input
            id="displayName"
            name="displayName"
            className="input"
            type="text"
            autoComplete="organization"
            maxLength={DISPLAY_NAME_MAX}
            defaultValue={state.values?.displayName}
            aria-required="true"
            aria-invalid={errors.displayName ? "true" : undefined}
            aria-describedby="displayName-help"
          />
        </Field>
      ) : null}

      <Field id="email" label="อีเมล" error={errors.email}>
        <input
          id="email"
          name="email"
          className="input"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="name@example.com"
          defaultValue={state.values?.email}
          aria-required="true"
          aria-invalid={errors.email ? "true" : undefined}
          aria-describedby="email-help"
        />
      </Field>

      <Field
        id="password"
        label="รหัสผ่าน"
        error={errors.password}
        hint={isLogin ? undefined : `อย่างน้อย ${PASSWORD_MIN} ตัวอักษร`}
      >
        <input
          id="password"
          name="password"
          className="input"
          type="password"
          autoComplete={isLogin ? "current-password" : "new-password"}
          maxLength={PASSWORD_MAX}
          aria-required="true"
          aria-invalid={errors.password ? "true" : undefined}
          aria-describedby="password-help"
        />
      </Field>

      <p role="alert" className="min-h-[1lh] text-sm text-error">
        {clientErrors ? null : state.message}
      </p>

      <button type="submit" className="btn btn-ink btn-lg mt-2 w-full" disabled={pending}>
        {pending ? <Spinner /> : null}
        {isLogin ? "เข้าสู่ระบบ" : "สร้างบัญชี"}
      </button>
    </form>
  );
}
