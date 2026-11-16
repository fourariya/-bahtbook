import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The "send again" rules of the forgot-password page, and the markup of the
 * recovery forms in each state, rendered without a browser. The countdown
 * ticking and the clicks themselves are covered in e2e/password-reset.spec.ts.
 */

vi.mock("@/app/(auth)/actions", () => ({
  requestPasswordReset: vi.fn(),
  updatePassword: vi.fn(),
}));

import {
  ForgotPasswordForm,
  RecoveryRequested,
  ResetPasswordForm,
} from "@/components/auth/password-forms";
import {
  INITIAL_RECOVERY_VIEW,
  RECOVERY_REQUESTED_MESSAGE,
  RECOVERY_REQUEST_FAILED_MESSAGE,
  RECOVERY_RESENT_MESSAGE,
  RESEND_COOLDOWN_SECONDS,
  nextRecoveryView,
  resendCooldownRemaining,
  type RecoveryRequestView,
} from "@/lib/auth/password-reset";

const T0 = 1_800_000_000_000;
const EMAIL = "owner@example.test";
const SENT = { status: "sent", message: RECOVERY_REQUESTED_MESSAGE } as const;

describe("resendCooldownRemaining", () => {
  it("counts down from 60 seconds to zero", () => {
    expect(RESEND_COOLDOWN_SECONDS).toBe(60);
    expect(resendCooldownRemaining(T0, T0)).toBe(60);
    expect(resendCooldownRemaining(T0, T0 + 1)).toBe(60);
    expect(resendCooldownRemaining(T0, T0 + 1_000)).toBe(59);
    expect(resendCooldownRemaining(T0, T0 + 59_000)).toBe(1);
    expect(resendCooldownRemaining(T0, T0 + 59_999)).toBe(1);
    expect(resendCooldownRemaining(T0, T0 + 60_000)).toBe(0);
    expect(resendCooldownRemaining(T0, T0 + 3_600_000)).toBe(0);
  });

  it("never exceeds 60 seconds when the clock reads earlier than the request", () => {
    expect(resendCooldownRemaining(T0, T0 - 5_000)).toBe(60);
  });

  it("is zero when nothing was sent", () => {
    expect(resendCooldownRemaining(0, T0)).toBe(0);
    expect(resendCooldownRemaining(Number.NaN, T0)).toBe(0);
  });
});

describe("nextRecoveryView", () => {
  it("shows the confirmation and starts the cooldown after an accepted request", () => {
    const view = nextRecoveryView(INITIAL_RECOVERY_VIEW, SENT, EMAIL, T0);
    expect(view).toEqual({
      status: "sent",
      message: RECOVERY_REQUESTED_MESSAGE,
      sends: 1,
      sentAt: T0,
      email: EMAIL,
    });
  });

  it("restarts the cooldown and clears an earlier error when a repeat is accepted", () => {
    const first = nextRecoveryView(INITIAL_RECOVERY_VIEW, SENT, EMAIL, T0);
    const failed = nextRecoveryView(first, { status: "error", message: "x" }, EMAIL, T0 + 61_000);
    const second = nextRecoveryView(failed, SENT, EMAIL, T0 + 62_000);
    expect(second.sends).toBe(2);
    expect(second.sentAt).toBe(T0 + 62_000);
    expect(second.resendError).toBeUndefined();
    expect(resendCooldownRemaining(second.sentAt, T0 + 62_000)).toBe(60);
  });

  it("keeps the confirmation, with an error and no new cooldown, when a repeat fails", () => {
    const first = nextRecoveryView(INITIAL_RECOVERY_VIEW, SENT, EMAIL, T0);
    for (const [result, reason] of [
      [{ status: "error", message: "ระบบยังไม่ได้เชื่อมต่อ" }, "ระบบยังไม่ได้เชื่อมต่อ"],
      [{ status: "error", fieldErrors: { email: "รูปแบบอีเมลไม่ถูกต้อง" } }, "รูปแบบอีเมลไม่ถูกต้อง"],
      [{ status: "error" }, RECOVERY_REQUEST_FAILED_MESSAGE],
    ] as const) {
      const view = nextRecoveryView(first, result, EMAIL, T0 + 61_000);
      expect(view.status).toBe("sent");
      expect(view.sends).toBe(1);
      expect(view.sentAt).toBe(T0);
      expect(view.email).toBe(EMAIL);
      expect(view.resendError).toBe(reason);
    }
  });

  it("returns to the form with the error when the first request fails", () => {
    const result = {
      status: "error",
      message: RECOVERY_REQUEST_FAILED_MESSAGE,
      values: { email: EMAIL },
    } as const;
    expect(nextRecoveryView(INITIAL_RECOVERY_VIEW, result, EMAIL, T0)).toEqual({
      ...result,
      sends: 0,
      sentAt: 0,
      email: "",
    });
  });

  it("uses wording that does not claim delivery or reveal whether an account exists", () => {
    for (const message of [RECOVERY_REQUESTED_MESSAGE, RECOVERY_RESENT_MESSAGE]) {
      expect(message).toContain("หากอีเมลนี้มีบัญชีอยู่");
      expect(message).not.toMatch(/ได้ส่ง|ส่งแล้ว|ไปให้แล้ว|ไม่พบบัญชี|ไม่มีบัญชี/);
    }
  });
});

describe("the confirmation shown after a request", () => {
  const view = (extra: Partial<RecoveryRequestView> = {}): RecoveryRequestView => ({
    ...nextRecoveryView(INITIAL_RECOVERY_VIEW, SENT, EMAIL, T0),
    ...extra,
  });
  const render = (shown: RecoveryRequestView, pending = false) =>
    renderToStaticMarkup(
      createElement(RecoveryRequested, { view: shown, formAction: vi.fn(), pending }),
    );
  const button = (html: string) => /<button[^>]*>[\s\S]*?<\/button>/.exec(html)![0];

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("explains the request, mentions spam, and never shows the address", () => {
    vi.setSystemTime(T0);
    const html = render(view());
    expect(html).toContain("ตรวจสอบอีเมลของคุณ");
    expect(html).toContain(RECOVERY_REQUESTED_MESSAGE);
    expect(html).toContain("Spam/Junk");
    // The address is carried only in the hidden field used to ask again.
    expect(html.replace(/<input[^>]*>/g, "")).not.toContain(EMAIL);
    expect(html).toMatch(/<input type="hidden" name="email" value="owner@example\.test"\/>/);
    expect(html).not.toContain(RECOVERY_RESENT_MESSAGE);
  });

  it("disables the button and shows the seconds left during the cooldown", () => {
    vi.setSystemTime(T0 + 18_000);
    const html = button(render(view()));
    expect(html).toContain("disabled");
    expect(html).toContain("ส่งลิงก์อีกครั้งได้ใน 42 วินาที");
  });

  it("enables the button once the cooldown is over", () => {
    vi.setSystemTime(T0 + 60_000);
    const html = button(render(view()));
    expect(html).not.toContain("disabled");
    expect(html).toContain(">ส่งลิงก์อีกครั้ง<");
  });

  it("shows a loading state while a repeat is on its way", () => {
    vi.setSystemTime(T0 + 60_000);
    const html = render(view({ resendError: "ข้อผิดพลาดเดิม" }), true);
    expect(button(html)).toContain("disabled");
    expect(button(html)).toContain("spinner");
    expect(button(html)).toContain("กำลังส่งคำขอ");
    expect(html).not.toContain("ข้อผิดพลาดเดิม");
  });

  it("confirms a repeated request without claiming delivery", () => {
    vi.setSystemTime(T0);
    expect(render(view({ sends: 2 }))).toContain(RECOVERY_RESENT_MESSAGE);
  });

  it("shows why a repeat failed, as an alert, and lets it be retried", () => {
    vi.setSystemTime(T0 + 61_000);
    const html = render(view({ resendError: RECOVERY_REQUEST_FAILED_MESSAGE }));
    expect(html).toMatch(new RegExp(`<p role="alert"[^>]*>${RECOVERY_REQUEST_FAILED_MESSAGE}</p>`));
    expect(button(html)).not.toContain("disabled");
    expect(html).not.toContain(RECOVERY_RESENT_MESSAGE);
  });
});

describe("the recovery forms", () => {
  it("the forgot-password form starts with the email field, not the confirmation", () => {
    const html = renderToStaticMarkup(createElement(ForgotPasswordForm, { configured: true }));
    expect(html).toContain('name="email"');
    expect(html).toContain("ส่งลิงก์ตั้งรหัสผ่านใหม่");
    expect(html).not.toContain("ส่งลิงก์อีกครั้ง");
  });

  it("the reset form links to a new recovery request below the save button", () => {
    const html = renderToStaticMarkup(createElement(ResetPasswordForm));
    const save = html.indexOf("บันทึกรหัสผ่านใหม่</button>");
    const hint = html.indexOf("ลิงก์หมดอายุหรือมีปัญหา?");
    expect(save).toBeGreaterThan(-1);
    expect(hint).toBeGreaterThan(save);
    expect(html.slice(hint)).toMatch(/<a [^>]*href="\/forgot-password"[^>]*>ขอรับลิงก์ใหม่<\/a>/);
    // Still the same form: both password fields and one submit button.
    expect(html.match(/type="password"/g)).toHaveLength(2);
    expect(html.match(/type="submit"/g)).toHaveLength(1);
  });
});
