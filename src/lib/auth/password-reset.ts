/**
 * Password recovery rules that do not depend on Next.js or on a live Supabase
 * client, so they can be unit tested directly.
 *
 * The flow:
 *   1. /forgot-password asks Supabase to email a recovery link.
 *   2. The link opens /auth/confirm, which verifies it and starts a session.
 *   3. /reset-password accepts a new password, but only for a session that was
 *      started by an emailed link a few minutes ago (see `isRecoverySession`).
 */

export const FORGOT_PASSWORD_PATH = "/forgot-password";
export const RESET_PASSWORD_PATH = "/reset-password";

/** How long after opening the emailed link the new password may be set. */
export const RECOVERY_WINDOW_SECONDS = 15 * 60;

/**
 * Authentication methods (the `amr` claim of the session token) that prove the
 * person just opened a link sent to the account's email address. A session
 * started with a password, OAuth or a refreshed token alone does not qualify.
 *
 * Supabase records "recovery" for a recovery link that went through the PKCE
 * code exchange, but "otp" for every `token_hash` link whatever its type
 * (recovery, magic link, email code, sign-up confirmation). So this claim
 * alone does not say the link was a recovery link: it is necessary, not
 * sufficient. The recovery marker below supplies the other half.
 */
export const RECOVERY_METHODS: readonly string[] = ["recovery", "otp"];

/**
 * Name and path of the httpOnly cookie that /auth/confirm sets only after it
 * has itself verified a recovery link. Its value is a proof signed by the
 * server for one user and one session (see recovery-proof.ts). The cookie
 * being present proves nothing; only a valid signature does.
 */
export const RECOVERY_MARKER_COOKIE = "bb-recovery";
export const RECOVERY_MARKER_PATH = "/reset-password";

/**
 * Whether a link that /auth/confirm just verified was a password recovery
 * link. For a `token_hash` link the type is the one Supabase verified the
 * token as. A `code` link carries no trustworthy type in its URL, so only what
 * the Auth server recorded for the session counts.
 */
export function isRecoveryConfirmation(input: {
  viaTokenHash: boolean;
  type: string | null;
  amr: unknown;
}): boolean {
  return input.viaTokenHash ? input.type === "recovery" : startedByRecovery(input.amr);
}

/**
 * Shown after every recovery request, whether or not the address has an
 * account, so the form cannot be used to discover registered emails.
 */
export const RECOVERY_REQUESTED_MESSAGE =
  "หากอีเมลนี้มีบัญชีอยู่ เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้ ลิงก์ใช้ได้ในเวลาจำกัดและใช้ได้ครั้งเดียว";

/** Shown after a repeated request. It confirms the request, not a delivery. */
export const RECOVERY_RESENT_MESSAGE =
  "รับคำขออีกครั้งแล้ว หากอีเมลนี้มีบัญชีอยู่ ลิงก์ใหม่จะถูกส่งไปให้ อีเมลอาจใช้เวลาสักครู่";

/** Shown when a request did not reach the server or came back unusable. */
export const RECOVERY_REQUEST_FAILED_MESSAGE = "ส่งคำขอไม่สำเร็จ ตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วลองอีกครั้ง";

/**
 * How long the "send again" button stays disabled after a request. This only
 * discourages repeated clicks in one tab; the limit that counts is enforced by
 * Supabase, whose refusals get the same generic answer as everything else.
 */
export const RESEND_COOLDOWN_SECONDS = 60;

/** Whole seconds left before another request may be made from this tab. */
export function resendCooldownRemaining(sentAtMs: number, nowMs: number): number {
  if (!Number.isFinite(sentAtMs) || sentAtMs <= 0) return 0;
  const left = Math.ceil((sentAtMs + RESEND_COOLDOWN_SECONDS * 1000 - nowMs) / 1000);
  return Math.min(RESEND_COOLDOWN_SECONDS, Math.max(0, left));
}

/** The answer of the recovery request Server Action, as the form sees it. */
export interface RecoveryRequestResult {
  status: "idle" | "error" | "sent" | "expired";
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: { email?: string };
}

/** What the forgot-password form shows. Lives in the browser tab only. */
export interface RecoveryRequestView extends RecoveryRequestResult {
  /** Requests accepted so far in this tab. */
  sends: number;
  /** When the last accepted request was made, in milliseconds. 0 if none. */
  sentAt: number;
  /** The address to ask again for. Kept in memory, never displayed. */
  email: string;
  /** Why the last repeated request failed, if it did. */
  resendError?: string;
}

export const INITIAL_RECOVERY_VIEW: RecoveryRequestView = {
  status: "idle",
  sends: 0,
  sentAt: 0,
  email: "",
};

/**
 * Folds the answer to a request into what the form shows next. An accepted
 * request restarts the cooldown. A failed repeat keeps the confirmation on
 * screen with an error and no new cooldown, so it can be retried at once.
 */
export function nextRecoveryView(
  previous: RecoveryRequestView,
  result: RecoveryRequestResult,
  email: string,
  nowMs: number,
): RecoveryRequestView {
  if (result.status === "sent") {
    return {
      status: "sent",
      message: result.message,
      sends: previous.sends + 1,
      sentAt: nowMs,
      email,
    };
  }
  if (previous.sends > 0) {
    const reason =
      result.message ??
      Object.values(result.fieldErrors ?? {})[0] ??
      RECOVERY_REQUEST_FAILED_MESSAGE;
    return { ...previous, resendError: reason };
  }
  return { ...result, sends: 0, sentAt: 0, email: "" };
}

/**
 * True when the session token says the user authenticated through an emailed
 * link within the recovery window. `amr` comes from a verified token; anything
 * malformed is treated as "no".
 */
export function isRecoverySession(amr: unknown, nowSeconds: number): boolean {
  if (!Array.isArray(amr)) return false;
  return amr.some((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return false;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    if (typeof method !== "string" || typeof timestamp !== "number") return false;
    if (!RECOVERY_METHODS.includes(method)) return false;
    const age = nowSeconds - timestamp;
    // A small allowance for clock difference between this server and the Auth server.
    return age >= -60 && age <= RECOVERY_WINDOW_SECONDS;
  });
}

/** True when the token's most recent authentication was specifically account recovery. */
export function startedByRecovery(amr: unknown): boolean {
  if (!Array.isArray(amr)) return false;
  const first = amr.find(
    (entry: unknown) =>
      typeof entry === "object" &&
      entry !== null &&
      (entry as { method?: unknown }).method !== "token_refresh",
  ) as { method?: unknown } | undefined;
  return first?.method === "recovery";
}

interface AuthErrorLike {
  code?: string;
  status?: number;
}

interface RecoveryEmailSender {
  resetPasswordForEmail(
    email: string,
    options?: { redirectTo?: string },
  ): Promise<{ error: AuthErrorLike | null }>;
}

/**
 * Asks Supabase to send the recovery email and reports nothing about the
 * outcome to the caller: unknown address, known address, rate limit and
 * outright failure all look the same from outside. Only an error code, never
 * the address, is passed to `log`.
 *
 * Without `redirectTo`, Supabase uses the Site URL configured in the project.
 */
export async function sendRecoveryEmail(
  auth: RecoveryEmailSender,
  email: string,
  redirectTo: string | undefined,
  log: (code: string) => void = () => {},
): Promise<void> {
  try {
    const { error } = await auth.resetPasswordForEmail(
      email,
      redirectTo ? { redirectTo } : undefined,
    );
    if (error) log(error.code ?? `status_${error.status ?? "unknown"}`);
  } catch {
    log("request_failed");
  }
}

export type PasswordUpdateFailure = "expired" | "same" | "weak" | "rate" | "unknown";

/** Maps a Supabase error from updating the password to a reason this app understands. */
export function passwordUpdateFailure(error: AuthErrorLike): PasswordUpdateFailure {
  switch (error.code) {
    case "same_password":
      return "same";
    case "weak_password":
      return "weak";
    case "session_not_found":
    case "session_expired":
    case "bad_jwt":
    case "no_authorization":
    case "user_not_found":
    case "reauthentication_needed":
    case "reauthentication_not_valid":
      return "expired";
    case "over_request_rate_limit":
      return "rate";
    default:
      if (error.status === 401 || error.status === 403) return "expired";
      if (error.status === 429) return "rate";
      return "unknown";
  }
}

export const PASSWORD_UPDATE_MESSAGES: Record<PasswordUpdateFailure, string> = {
  expired: "ลิงก์ตั้งรหัสผ่านหมดอายุหรือถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่",
  same: "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม",
  weak: "รหัสผ่านคาดเดาง่ายเกินไป กรุณาตั้งรหัสผ่านที่ยาวและซับซ้อนขึ้น",
  rate: "มีการส่งคำขอถี่เกินไป กรุณารอสักครู่แล้วลองใหม่",
  unknown: "ตั้งรหัสผ่านใหม่ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
};

/**
 * Where /auth/confirm sends the browser after a link was verified. The reset
 * page is chosen by the link's own type or by the verified session, never by a
 * destination supplied in the URL, and it is a fixed path.
 */
export function postConfirmPath(input: {
  type: string | null;
  recoverySession: boolean;
  workspacePath: string;
}): string {
  return input.type === "recovery" || input.recoverySession
    ? RESET_PASSWORD_PATH
    : input.workspacePath;
}

/** Where /auth/confirm sends the browser when a link could not be verified. */
export function failedConfirmPath(type: string | null): string {
  return type === "recovery" ? FORGOT_PASSWORD_PATH : "/login";
}
