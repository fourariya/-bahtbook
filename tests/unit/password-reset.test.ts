import { describe, expect, it, vi } from "vitest";

import {
  FORGOT_PASSWORD_PATH,
  PASSWORD_UPDATE_MESSAGES,
  RECOVERY_REQUESTED_MESSAGE,
  RECOVERY_WINDOW_SECONDS,
  RESET_PASSWORD_PATH,
  failedConfirmPath,
  isRecoveryConfirmation,
  isRecoverySession,
  passwordUpdateFailure,
  postConfirmPath,
  recoveryMarkerMatches,
  sendRecoveryEmail,
  startedByRecovery,
} from "@/lib/auth/password-reset";
import {
  fieldErrorsOf,
  forgotPasswordSchema,
  resetPasswordSchema,
  safeNextPath,
  signUpSchema,
} from "@/lib/finance/validation";

const NOW = 1_800_000_000;

describe("forgotPasswordSchema", () => {
  it("accepts an email and normalises it", () => {
    expect(forgotPasswordSchema.parse({ email: "  Owner@Example.COM " })).toEqual({
      email: "owner@example.com",
    });
  });

  it.each(["", "   ", "plain", "a@", "@b.co", "a b@c.co", "a@b"])("rejects %j", (email) => {
    const result = forgotPasswordSchema.safeParse({ email });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrorsOf(result.error)).toHaveProperty("email");
  });

  it("rejects a missing or non-string value without throwing", () => {
    expect(forgotPasswordSchema.safeParse({}).success).toBe(false);
    expect(forgotPasswordSchema.safeParse({ email: null }).success).toBe(false);
    expect(forgotPasswordSchema.safeParse(null).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("accepts two matching passwords of a valid length", () => {
    const values = { password: "correct-horse", confirmPassword: "correct-horse" };
    expect(resetPasswordSchema.parse(values)).toEqual(values);
    const longest = "p".repeat(72);
    expect(
      resetPasswordSchema.safeParse({ password: longest, confirmPassword: longest }).success,
    ).toBe(true);
  });

  it("reports a mismatch on the confirmation field", () => {
    const result = resetPasswordSchema.safeParse({
      password: "correct-horse",
      confirmPassword: "correct-hors",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(fieldErrorsOf(result.error)).toEqual({
        confirmPassword: "รหัสผ่านทั้งสองช่องไม่ตรงกัน",
      });
    }
  });

  it("treats passwords that differ only in case or spaces as different", () => {
    for (const confirmPassword of ["Correct-horse", "correct-horse ", " correct-horse"]) {
      expect(
        resetPasswordSchema.safeParse({ password: "correct-horse", confirmPassword }).success,
      ).toBe(false);
    }
  });

  it("enforces the minimum and maximum length", () => {
    const short = resetPasswordSchema.safeParse({ password: "short", confirmPassword: "short" });
    expect(short.success).toBe(false);
    if (!short.success) expect(fieldErrorsOf(short.error).password).toContain("อย่างน้อย 8");

    const long = "p".repeat(73);
    const tooLong = resetPasswordSchema.safeParse({ password: long, confirmPassword: long });
    expect(tooLong.success).toBe(false);
    if (!tooLong.success) expect(fieldErrorsOf(tooLong.error).password).toContain("ไม่เกิน 72");
  });

  it("requires the confirmation", () => {
    const result = resetPasswordSchema.safeParse({
      password: "correct-horse",
      confirmPassword: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrorsOf(result.error)).toHaveProperty("confirmPassword");
    expect(resetPasswordSchema.safeParse({ password: "correct-horse" }).success).toBe(false);
  });

  it("applies exactly the same password rule as sign-up", () => {
    for (const password of ["", "1234567", "12345678", "p".repeat(72), "p".repeat(73)]) {
      const signUp = signUpSchema.safeParse({ displayName: "x", email: "a@b.co", password });
      const reset = resetPasswordSchema.safeParse({ password, confirmPassword: password });
      expect(reset.success, `password of length ${password.length}`).toBe(signUp.success);
    }
  });
});

describe("isRecoverySession", () => {
  const entry = (method: string, ageSeconds: number) => ({ method, timestamp: NOW - ageSeconds });

  it.each(["recovery", "otp"])("accepts a recent %s sign-in", (method) => {
    expect(isRecoverySession([entry(method, 30)], NOW)).toBe(true);
  });

  it.each([
    "password",
    "oauth",
    "anonymous",
    "totp",
    "sso/saml",
    "email/signup",
    "token_refresh",
    "magiclink",
    "invite",
    "email_change",
  ])("rejects a session started by %s", (method) => {
    expect(isRecoverySession([entry(method, 30)], NOW)).toBe(false);
  });

  it("accepts the link right up to the end of the window and not after", () => {
    expect(isRecoverySession([entry("recovery", RECOVERY_WINDOW_SECONDS)], NOW)).toBe(true);
    expect(isRecoverySession([entry("recovery", RECOVERY_WINDOW_SECONDS + 1)], NOW)).toBe(false);
    expect(isRecoverySession([entry("recovery", 24 * 60 * 60)], NOW)).toBe(false);
  });

  it("still accepts a recent recovery after the token was refreshed", () => {
    expect(isRecoverySession([entry("token_refresh", 5), entry("recovery", 600)], NOW)).toBe(true);
  });

  it("is not fooled by an old recovery followed by a password login", () => {
    expect(isRecoverySession([entry("password", 10), entry("recovery", 7200)], NOW)).toBe(false);
  });

  it("rejects a timestamp from the future beyond a small clock difference", () => {
    expect(isRecoverySession([entry("recovery", -30)], NOW)).toBe(true);
    expect(isRecoverySession([entry("recovery", -3600)], NOW)).toBe(false);
  });

  it("treats anything malformed as not a recovery session", () => {
    for (const amr of [
      undefined,
      null,
      "recovery",
      {},
      [],
      [null],
      ["recovery"],
      [{ method: "recovery" }],
      [{ method: "recovery", timestamp: String(NOW) }],
      [{ method: 5, timestamp: NOW }],
    ]) {
      expect(isRecoverySession(amr, NOW)).toBe(false);
    }
  });
});

describe("recoveryMarkerMatches", () => {
  it("accepts only a marker that names the session making the request", () => {
    expect(recoveryMarkerMatches("session-1", "session-1")).toBe(true);
    expect(recoveryMarkerMatches("session-1", "session-2")).toBe(false);
    expect(recoveryMarkerMatches(undefined, "session-1")).toBe(false);
    expect(recoveryMarkerMatches("session-1", undefined)).toBe(false);
    expect(recoveryMarkerMatches("", "")).toBe(false);
    expect(recoveryMarkerMatches(undefined, undefined)).toBe(false);
    expect(recoveryMarkerMatches(1, 1)).toBe(false);
  });
});

describe("isRecoveryConfirmation", () => {
  const amr = (method: string) => [{ method, timestamp: NOW }];
  const check = (viaTokenHash: boolean, type: string | null, method?: string) =>
    isRecoveryConfirmation({ viaTokenHash, type, amr: method ? amr(method) : undefined });

  it("accepts a token hash that was verified as a recovery token", () => {
    expect(check(true, "recovery", "otp")).toBe(true);
  });

  it.each(["magiclink", "email", "signup", "invite", "email_change"])(
    "rejects a token hash verified as %s, although its session looks the same",
    (type) => {
      expect(check(true, type, "otp")).toBe(false);
    },
  );

  it("for a code link, believes the session and never the type in the URL", () => {
    expect(check(false, null, "recovery")).toBe(true);
    for (const method of ["magiclink", "otp", "email/signup", "oauth", "password"]) {
      expect(check(false, "recovery", method)).toBe(false);
    }
    expect(check(false, "recovery")).toBe(false);
  });
});

describe("startedByRecovery", () => {
  it("looks at the most recent real sign-in, skipping token refreshes", () => {
    expect(startedByRecovery([{ method: "recovery", timestamp: NOW }])).toBe(true);
    expect(
      startedByRecovery([
        { method: "token_refresh", timestamp: NOW },
        { method: "recovery", timestamp: NOW - 60 },
      ]),
    ).toBe(true);
    expect(startedByRecovery([{ method: "email/signup", timestamp: NOW }])).toBe(false);
    expect(
      startedByRecovery([
        { method: "password", timestamp: NOW },
        { method: "recovery", timestamp: NOW - 60 },
      ]),
    ).toBe(false);
    expect(startedByRecovery(undefined)).toBe(false);
    expect(startedByRecovery([])).toBe(false);
  });
});

describe("sendRecoveryEmail", () => {
  const redirect = "https://app.example.test/auth/confirm";

  it("passes the address and the return address to Supabase", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
    await sendRecoveryEmail({ resetPasswordForEmail }, "owner@example.test", redirect);
    expect(resetPasswordForEmail).toHaveBeenCalledExactlyOnceWith("owner@example.test", {
      redirectTo: redirect,
    });
  });

  it("sends no return address when none is trusted, leaving it to the project's Site URL", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
    await sendRecoveryEmail({ resetPasswordForEmail }, "owner@example.test", undefined);
    expect(resetPasswordForEmail).toHaveBeenCalledExactlyOnceWith("owner@example.test", undefined);
  });

  it("behaves identically for success, unknown account, rate limit and outright failure", async () => {
    const outcomes = [
      () => Promise.resolve({ error: null }),
      () => Promise.resolve({ error: { code: "user_not_found", status: 404 } }),
      () => Promise.resolve({ error: { code: "over_email_send_rate_limit", status: 429 } }),
      () => Promise.resolve({ error: { status: 500 } }),
      () => Promise.reject(new Error("network down")),
    ];
    const results = [];
    for (const outcome of outcomes) {
      results.push(
        await sendRecoveryEmail({ resetPasswordForEmail: outcome }, "owner@example.test", redirect),
      );
    }
    // Nothing is returned and nothing is thrown, so the caller cannot tell the cases apart.
    expect(results).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });

  it("logs an error code only, never the email address", async () => {
    const log = vi.fn();
    const failing = {
      resetPasswordForEmail: () =>
        Promise.resolve({ error: { code: "over_email_send_rate_limit", status: 429 } }),
    };
    await sendRecoveryEmail(failing, "owner@example.test", redirect, log);
    await sendRecoveryEmail(
      { resetPasswordForEmail: () => Promise.resolve({ error: { status: 500 } }) },
      "owner@example.test",
      redirect,
      log,
    );
    await sendRecoveryEmail(
      { resetPasswordForEmail: () => Promise.reject(new Error("owner@example.test failed")) },
      "owner@example.test",
      redirect,
      log,
    );
    expect(log.mock.calls).toEqual([
      ["over_email_send_rate_limit"],
      ["status_500"],
      ["request_failed"],
    ]);
    expect(JSON.stringify(log.mock.calls)).not.toContain("owner@");
  });

  it("does not log when the request succeeded", async () => {
    const log = vi.fn();
    await sendRecoveryEmail(
      { resetPasswordForEmail: () => Promise.resolve({ error: null }) },
      "owner@example.test",
      redirect,
      log,
    );
    expect(log).not.toHaveBeenCalled();
  });

  it("the confirmation message does not say whether an account exists", () => {
    expect(RECOVERY_REQUESTED_MESSAGE).toContain("หากอีเมลนี้มีบัญชีอยู่");
    expect(RECOVERY_REQUESTED_MESSAGE).not.toMatch(/ไม่พบ|ไม่มีบัญชี/);
  });
});

describe("passwordUpdateFailure", () => {
  it.each([
    [{ code: "same_password" }, "same"],
    [{ code: "weak_password" }, "weak"],
    [{ code: "session_not_found" }, "expired"],
    [{ code: "session_expired" }, "expired"],
    [{ code: "bad_jwt" }, "expired"],
    [{ code: "reauthentication_needed" }, "expired"],
    [{ status: 401 }, "expired"],
    [{ status: 403 }, "expired"],
    [{ code: "over_request_rate_limit" }, "rate"],
    [{ status: 429 }, "rate"],
    [{ code: "unexpected_failure", status: 500 }, "unknown"],
    [{}, "unknown"],
  ] as const)("maps %j to %s", (error, expected) => {
    expect(passwordUpdateFailure(error)).toBe(expected);
  });

  it("has a Thai message for every outcome", () => {
    for (const reason of ["expired", "same", "weak", "rate", "unknown"] as const) {
      expect(PASSWORD_UPDATE_MESSAGES[reason].length).toBeGreaterThan(10);
    }
  });
});

describe("where /auth/confirm sends the browser", () => {
  it("sends a verified recovery link to the reset page", () => {
    expect(
      postConfirmPath({ type: "recovery", recoverySession: false, workspacePath: "/app" }),
    ).toBe(RESET_PASSWORD_PATH);
    expect(postConfirmPath({ type: null, recoverySession: true, workspacePath: "/app" })).toBe(
      RESET_PASSWORD_PATH,
    );
  });

  it("sends any other verified link into the workspace", () => {
    for (const type of ["email", "signup", "magiclink", null]) {
      expect(
        postConfirmPath({ type, recoverySession: false, workspacePath: "/app/transactions" }),
      ).toBe("/app/transactions");
    }
  });

  it("never takes the destination from the URL, so it cannot be turned into an open redirect", () => {
    for (const hostile of [
      "https://evil.example",
      "//evil.example",
      "/reset-password/../x",
      "/\\evil",
    ]) {
      // `next` only ever reaches postConfirmPath after safeNextPath, which confines it to /app.
      const workspacePath = safeNextPath(hostile);
      expect(workspacePath).toBe("/app");
      expect(postConfirmPath({ type: "recovery", recoverySession: false, workspacePath })).toBe(
        RESET_PASSWORD_PATH,
      );
      expect(postConfirmPath({ type: "email", recoverySession: false, workspacePath })).toBe(
        "/app",
      );
    }
  });

  it("sends a failed recovery link back to request a new one, and other failures to login", () => {
    expect(failedConfirmPath("recovery")).toBe(FORGOT_PASSWORD_PATH);
    expect(failedConfirmPath("email")).toBe("/login");
    expect(failedConfirmPath(null)).toBe("/login");
    expect(failedConfirmPath("https://evil.example")).toBe("/login");
  });
});
