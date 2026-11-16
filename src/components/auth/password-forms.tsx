"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, type FormEvent } from "react";

import { requestPasswordReset, updatePassword, type PasswordFormState } from "@/app/(auth)/actions";
import { Field, Spinner } from "@/components/ui/primitives";
import {
  FORGOT_PASSWORD_PATH,
  INITIAL_RECOVERY_VIEW,
  RECOVERY_REQUEST_FAILED_MESSAGE,
  RECOVERY_RESENT_MESSAGE,
  RESEND_COOLDOWN_SECONDS,
  nextRecoveryView,
  resendCooldownRemaining,
  type RecoveryRequestView,
} from "@/lib/auth/password-reset";
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  fieldErrorsOf,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@/lib/finance/validation";

const INITIAL: PasswordFormState = { status: "idle" };

/**
 * Runs a schema in the browser for instant feedback. The same schema runs
 * again in the Server Action, which is the check that counts.
 */
function useClientValidation(
  schema: typeof forgotPasswordSchema | typeof resetPasswordSchema,
  order: string[],
) {
  const [clientErrors, setClientErrors] = useState<Record<string, string> | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const parsed = schema.safeParse(Object.fromEntries(new FormData(form)));
    if (parsed.success) {
      setClientErrors(null);
      return;
    }
    event.preventDefault();
    const errors = fieldErrorsOf(parsed.error);
    setClientErrors(errors);
    const first = order.find((name) => errors[name]);
    if (first) form.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
  }

  return { clientErrors, handleSubmit };
}

/**
 * Sends the request through the one Server Action, first time and every
 * repeat. A request that never reaches the server becomes an ordinary error
 * instead of breaking the page.
 */
async function submitRecoveryRequest(
  previous: RecoveryRequestView,
  formData: FormData,
): Promise<RecoveryRequestView> {
  const email = String(formData.get("email") ?? "");
  let result: PasswordFormState;
  try {
    result = await requestPasswordReset(INITIAL, formData);
  } catch {
    result = { status: "error", message: RECOVERY_REQUEST_FAILED_MESSAGE, values: { email } };
  }
  return nextRecoveryView(previous, result, email, Date.now());
}

/** Seconds left before the request may be repeated, counted down once a second. */
function useResendCooldown(sentAt: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= sentAt + RESEND_COOLDOWN_SECONDS * 1000) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [sentAt]);

  return resendCooldownRemaining(sentAt, now);
}

/** Step 1, after a request: what to do next, and a way to ask again. */
export function RecoveryRequested({
  view,
  formAction,
  pending,
}: {
  view: RecoveryRequestView;
  formAction: (formData: FormData) => void;
  pending: boolean;
}) {
  const remaining = useResendCooldown(view.sentAt);
  const waiting = remaining > 0;

  return (
    <div>
      <div role="status">
        <h2 className="text-lg">ตรวจสอบอีเมลของคุณ</h2>
        <p className="mt-2 text-sm text-ink-2">{view.message}</p>
        <p className="mt-4 text-sm text-muted">
          ไม่พบอีเมลใช่ไหม ลองดูในโฟลเดอร์สแปมหรืออีเมลขยะ (Spam/Junk) อีเมลอาจใช้เวลาสักครู่กว่าจะมาถึง
        </p>
      </div>

      <form action={formAction} className="mt-6">
        <input type="hidden" name="email" value={view.email} />
        <button type="submit" className="btn btn-card btn-lg w-full" disabled={pending || waiting}>
          {pending ? <Spinner /> : null}
          {pending ? "กำลังส่งคำขอ" : waiting ? `ส่งลิงก์อีกครั้งได้ใน ${remaining} วินาที` : "ส่งลิงก์อีกครั้ง"}
        </button>
      </form>

      <p role="status" data-resend-feedback className="mt-2 min-h-[1lh] text-sm text-muted">
        {!pending && !view.resendError && view.sends > 1 ? RECOVERY_RESENT_MESSAGE : null}
      </p>
      <p role="alert" className="text-sm text-error">
        {pending ? null : view.resendError}
      </p>
    </div>
  );
}

/** Step 1: ask for the account's email address. */
export function ForgotPasswordForm({ configured }: { configured: boolean }) {
  const [state, formAction, pending] = useActionState(submitRecoveryRequest, INITIAL_RECOVERY_VIEW);
  const { clientErrors, handleSubmit } = useClientValidation(forgotPasswordSchema, ["email"]);
  const errors = clientErrors ?? state.fieldErrors ?? {};

  if (state.status === "sent") {
    return <RecoveryRequested view={state} formAction={formAction} pending={pending} />;
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} noValidate>
      {!configured ? (
        <p className="mb-4 border-l-2 border-accent bg-paper-2 px-3 py-2 text-sm">
          ระบบสมาชิกยังไม่ได้เชื่อมต่อกับ Supabase ในเครื่องนี้ จึงยังส่งลิงก์ตั้งรหัสผ่านใหม่ไม่ได้ ดูขั้นตอนตั้งค่าใน README
        </p>
      ) : null}

      <Field id="email" label="อีเมล" error={errors.email} hint="อีเมลที่ใช้สมัครบัญชี">
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

      <p role="alert" className="min-h-[1lh] text-sm text-error">
        {clientErrors ? null : state.message}
      </p>

      <button type="submit" className="btn btn-ink btn-lg mt-2 w-full" disabled={pending}>
        {pending ? <Spinner /> : null}
        ส่งลิงก์ตั้งรหัสผ่านใหม่
      </button>
    </form>
  );
}

/** What a visitor sees when there is no valid recovery session to act on. */
export function RecoveryLinkExpired({ message }: { message?: string }) {
  return (
    <div role="alert">
      <p className="border-l-2 border-error bg-paper-2 px-3 py-2 text-sm text-ink">
        {message ?? "ลิงก์ตั้งรหัสผ่านใช้ไม่ได้ หมดอายุ หรือถูกใช้ไปแล้ว"}
      </p>
      <p className="mt-4 text-sm text-muted">
        ลิงก์ใช้ได้ครั้งเดียวและมีอายุจำกัด{" "}
        <Link href={FORGOT_PASSWORD_PATH} className="text-link">
          ขอลิงก์ใหม่
        </Link>
      </p>
    </div>
  );
}

/** Step 3: choose the new password. Rendered only for a valid recovery session. */
export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(updatePassword, INITIAL);
  const { clientErrors, handleSubmit } = useClientValidation(resetPasswordSchema, [
    "password",
    "confirmPassword",
  ]);
  const errors = clientErrors ?? state.fieldErrors ?? {};

  // The session ran out, or the link was already used, between opening the page and submitting.
  if (state.status === "expired") return <RecoveryLinkExpired message={state.message} />;

  return (
    <form action={formAction} onSubmit={handleSubmit} noValidate>
      <Field
        id="password"
        label="รหัสผ่านใหม่"
        error={errors.password}
        hint={`อย่างน้อย ${PASSWORD_MIN} ตัวอักษร`}
      >
        <input
          id="password"
          name="password"
          className="input"
          type="password"
          autoComplete="new-password"
          maxLength={PASSWORD_MAX}
          aria-required="true"
          aria-invalid={errors.password ? "true" : undefined}
          aria-describedby="password-help"
        />
      </Field>

      <Field id="confirmPassword" label="ยืนยันรหัสผ่านใหม่" error={errors.confirmPassword}>
        <input
          id="confirmPassword"
          name="confirmPassword"
          className="input"
          type="password"
          autoComplete="new-password"
          maxLength={PASSWORD_MAX}
          aria-required="true"
          aria-invalid={errors.confirmPassword ? "true" : undefined}
          aria-describedby="confirmPassword-help"
        />
      </Field>

      <p role="alert" className="min-h-[1lh] text-sm text-error">
        {clientErrors ? null : state.message}
      </p>

      <button type="submit" className="btn btn-ink btn-lg mt-2 w-full" disabled={pending}>
        {pending ? <Spinner /> : null}
        บันทึกรหัสผ่านใหม่
      </button>

      <p className="mt-4 text-center text-sm text-muted">
        ลิงก์หมดอายุหรือมีปัญหา?{" "}
        <Link href={FORGOT_PASSWORD_PATH} className="text-link hit-area">
          ขอรับลิงก์ใหม่
        </Link>
      </p>
    </form>
  );
}
