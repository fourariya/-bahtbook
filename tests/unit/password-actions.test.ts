import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The two password-recovery Server Actions, run for real with Supabase and the
 * Next.js request APIs replaced by fakes. This covers the logic of a
 * successful password update, which cannot be driven end to end automatically
 * because it starts from a link in a real email.
 */

const shared = vi.hoisted(() => ({
  client: null as unknown,
  host: "localhost:3000",
  protocol: "http",
  cookies: new Map<string, string>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(
    async () => new Headers({ host: shared.host, "x-forwarded-proto": shared.protocol }),
  ),
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      shared.cookies.has(name) ? { name, value: shared.cookies.get(name)! } : undefined,
    set: (name: string, value: string, options?: { maxAge?: number }) => {
      if (options?.maxAge === 0) shared.cookies.delete(name);
      else shared.cookies.set(name, value);
    },
  })),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => shared.client) }));

import { logOut, requestPasswordReset, updatePassword } from "@/app/(auth)/actions";
import { createRecoveryProof } from "@/lib/auth/recovery-proof";
import {
  PASSWORD_UPDATE_MESSAGES,
  RECOVERY_MARKER_COOKIE,
  RECOVERY_REQUESTED_MESSAGE,
} from "@/lib/auth/password-reset";

const EMAIL = "owner@example.test";
const PASSWORD = "a-brand-new-passphrase";
const IDLE = { status: "idle" } as const;
const seconds = () => Math.floor(Date.now() / 1000);
const USER_ID = "user-1";
const SESSION_ID = "session-1";
// Made up for these tests. Not used anywhere else.
const SECRET = "unit-test-only-recovery-proof-secret-0001";
const OTHER_SECRET = "unit-test-only-recovery-proof-secret-0002";
/** A proof as /auth/confirm would issue it, with any part overridden. */
const proof = (over: { userId?: string; sessionId?: string; at?: number; secret?: string } = {}) =>
  createRecoveryProof(
    { userId: over.userId ?? USER_ID, sessionId: over.sessionId ?? SESSION_ID },
    over.at ?? seconds(),
    over.secret ?? SECRET,
  );

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

interface FakeOptions {
  user?: { id: string } | null;
  amr?: unknown;
  sessionId?: unknown;
  updateError?: { code?: string; status?: number } | null;
  recoverError?: { code?: string; status?: number } | null;
  recoverThrows?: boolean;
}

function fakeSupabase(options: FakeOptions = {}) {
  const {
    user = { id: "user-1" },
    updateError = null,
    recoverError = null,
    recoverThrows = false,
  } = options;
  // A destructuring default would replace an explicit `amr: undefined`, so the
  // "token without the claim" case is told apart by whether the key is present.
  const amr = "amr" in options ? options.amr : [{ method: "recovery", timestamp: seconds() - 30 }];
  const sessionId = "sessionId" in options ? options.sessionId : SESSION_ID;
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user }, error: user ? null : { code: "no_session" } })),
      getClaims: vi.fn(async () => ({
        data: user ? { claims: { sub: user.id, amr, session_id: sessionId } } : null,
      })),
      updateUser: vi.fn(async () => ({ data: {}, error: updateError })),
      signOut: vi.fn(async () => ({ error: null })),
      resetPasswordForEmail: vi.fn(async () => {
        if (recoverThrows) throw new Error(`could not reach auth for ${EMAIL}`);
        return { data: {}, error: recoverError };
      }),
    },
  };
}

let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  shared.host = "localhost:3000";
  shared.protocol = "http";
  // /auth/confirm issued this proof after verifying a recovery link.
  vi.stubEnv("RECOVERY_PROOF_SECRET", SECRET);
  shared.cookies = new Map([[RECOVERY_MARKER_COOKIE, proof()]]);
  vi.stubEnv("SITE_URL", "https://bahtbook.example.test");
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  errorLog.mockRestore();
});

describe("requestPasswordReset", () => {
  it("rejects a malformed address before contacting Supabase", async () => {
    const supabase = fakeSupabase();
    shared.client = supabase;
    const result = await requestPasswordReset(IDLE, form({ email: "not-an-email" }));
    expect(result.status).toBe("error");
    expect(result.fieldErrors).toHaveProperty("email");
    expect(result.values).toEqual({ email: "not-an-email" });
    expect(supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("sends the normalised address with the configured site as the return address", async () => {
    const supabase = fakeSupabase();
    shared.client = supabase;
    await requestPasswordReset(IDLE, form({ email: "  Owner@Example.TEST " }));
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledExactlyOnceWith(EMAIL, {
      redirectTo: "https://bahtbook.example.test/auth/confirm",
    });
  });

  it("gives the same answer whether the account exists, is rate limited or Supabase fails", async () => {
    const outcomes: FakeOptions[] = [
      {},
      { recoverError: { code: "user_not_found", status: 404 } },
      { recoverError: { code: "over_email_send_rate_limit", status: 429 } },
      { recoverError: { status: 500 } },
      { recoverThrows: true },
    ];
    for (const outcome of outcomes) {
      shared.client = fakeSupabase(outcome);
      const result = await requestPasswordReset(IDLE, form({ email: EMAIL }));
      expect(result).toEqual({ status: "sent", message: RECOVERY_REQUESTED_MESSAGE });
    }
  });

  it("never echoes or logs the address", async () => {
    shared.client = fakeSupabase({ recoverThrows: true });
    const result = await requestPasswordReset(IDLE, form({ email: EMAIL }));
    expect(JSON.stringify(result)).not.toContain("owner@");
    expect(errorLog).toHaveBeenCalled();
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("owner@");
  });

  it("does not put an untrusted Host header into the recovery link", async () => {
    vi.stubEnv("SITE_URL", "");
    shared.host = "evil.example";
    shared.protocol = "https";
    const supabase = fakeSupabase();
    shared.client = supabase;
    await requestPasswordReset(IDLE, form({ email: EMAIL }));
    // No return address at all: Supabase then uses the Site URL set in the project.
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledExactlyOnceWith(EMAIL, undefined);
  });

  it("uses the local address during development when SITE_URL is not set", async () => {
    vi.stubEnv("SITE_URL", "");
    const supabase = fakeSupabase();
    shared.client = supabase;
    await requestPasswordReset(IDLE, form({ email: EMAIL }));
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledExactlyOnceWith(EMAIL, {
      redirectTo: "http://localhost:3000/auth/confirm",
    });
  });

  it("explains itself when Supabase is not connected", async () => {
    shared.client = null;
    const result = await requestPasswordReset(IDLE, form({ email: EMAIL }));
    expect(result.status).toBe("error");
    expect(result.message).toContain("Supabase");
  });
});

describe("updatePassword", () => {
  const valid = () => form({ password: PASSWORD, confirmPassword: PASSWORD });

  it("updates the password, ends every session and sends the user to log in", async () => {
    const supabase = fakeSupabase();
    shared.client = supabase;
    await expect(updatePassword(IDLE, valid())).rejects.toThrow(
      "REDIRECT:/login?notice=password-updated",
    );
    expect(supabase.auth.updateUser).toHaveBeenCalledExactlyOnceWith({ password: PASSWORD });
    expect(supabase.auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "global" });
    // The marker is spent with the link.
    expect(shared.cookies.has(RECOVERY_MARKER_COOKIE)).toBe(false);
  });

  // Supabase records "otp" for every token-hash link: recovery, magic link,
  // email code and sign-up confirmation alike. Only the signed proof tells them apart.
  it.each([
    ["a magic-link, email-code or sign-up confirmation session", "otp"],
    ["a recovery-type session that /auth/confirm did not mark", "recovery"],
  ])("refuses %s (fresh emailed link, no proof)", async (_label, method) => {
    shared.cookies.clear();
    const supabase = fakeSupabase({ amr: [{ method, timestamp: seconds() - 30 }] });
    shared.client = supabase;
    const result = await updatePassword(IDLE, valid());
    expect(result).toEqual({ status: "expired", message: PASSWORD_UPDATE_MESSAGES.expired });
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    ["belongs to another session", { sessionId: "session-2" }],
    ["belongs to another user", { user: { id: "user-2" } }],
    ["is presented with a token that has no session id", { sessionId: undefined }],
    ["is presented with an empty session id", { sessionId: "" }],
  ] as Array<[string, FakeOptions]>)("refuses when the proof %s", async (_label, options) => {
    const supabase = fakeSupabase(options);
    shared.client = supabase;
    const result = await updatePassword(IDLE, valid());
    expect(result).toEqual({ status: "expired", message: PASSWORD_UPDATE_MESSAGES.expired });
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    ["a made-up value", () => "forged"],
    ["the bare session id, as an unsigned marker would be", () => SESSION_ID],
    ["an empty value", () => ""],
    ["a proof signed with another secret", () => proof({ secret: OTHER_SECRET })],
    ["a proof issued for another user", () => proof({ userId: "user-2" })],
    ["a proof issued for another session", () => proof({ sessionId: "session-2" })],
    ["a proof that expired a minute ago", () => proof({ at: seconds() - 16 * 60 })],
    [
      "a proof whose expiry was pushed forward",
      () => {
        const [version, expiry, signature] = proof({ at: seconds() - 16 * 60 }).split(".");
        return [version, Number(expiry) + 3600, signature].join(".");
      },
    ],
    [
      "a proof whose signature was altered",
      () => {
        const value = proof();
        return value.slice(0, -1) + (value.endsWith("A") ? "B" : "A");
      },
    ],
    ["a proof with its signature removed", () => proof().split(".").slice(0, 2).join(".")],
    ["a proof with another version label", () => proof().replace(/^v1/, "v2")],
  ] as Array<[string, () => string]>)("refuses %s", async (_label, forge) => {
    shared.cookies.set(RECOVERY_MARKER_COOKIE, forge());
    const supabase = fakeSupabase({ amr: [{ method: "otp", timestamp: seconds() - 30 }] });
    shared.client = supabase;
    const result = await updatePassword(IDLE, valid());
    expect(result).toEqual({ status: "expired", message: PASSWORD_UPDATE_MESSAGES.expired });
    expect(supabase.auth.getUser).toHaveBeenCalled();
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
    // A proof that did not hold is removed, not left for another try.
    expect(shared.cookies.has(RECOVERY_MARKER_COOKIE)).toBe(false);
  });

  it.each([
    ["missing", ""],
    ["too short", "short-secret"],
  ])("refuses every proof when the signing secret is %s", async (_label, secret) => {
    vi.stubEnv("RECOVERY_PROOF_SECRET", secret);
    // Even one that would verify if a short or empty secret were accepted.
    if (secret) shared.cookies.set(RECOVERY_MARKER_COOKIE, proof({ secret }));
    const supabase = fakeSupabase();
    shared.client = supabase;
    const result = await updatePassword(IDLE, valid());
    expect(result.status).toBe("expired");
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it("never logs the proof, the session id or the signing secret", async () => {
    const value = proof();
    shared.cookies.set(RECOVERY_MARKER_COOKIE, value);
    shared.client = fakeSupabase({ updateError: { code: "unexpected_failure", status: 500 } });
    await updatePassword(IDLE, valid());
    const logged = JSON.stringify(errorLog.mock.calls);
    for (const secretValue of [value, SESSION_ID, SECRET])
      expect(logged).not.toContain(secretValue);
  });

  it("refuses a valid proof on a session whose sign-in method is not an emailed recovery", async () => {
    for (const method of ["magiclink", "password", "oauth"]) {
      const supabase = fakeSupabase({ amr: [{ method, timestamp: seconds() - 30 }] });
      shared.client = supabase;
      const result = await updatePassword(IDLE, valid());
      expect(result.status).toBe("expired");
      expect(supabase.auth.updateUser).not.toHaveBeenCalled();
    }
  });

  it("accepts a valid proof on a session whose link was verified as a token hash", async () => {
    const supabase = fakeSupabase({ amr: [{ method: "otp", timestamp: seconds() - 30 }] });
    shared.client = supabase;
    await expect(updatePassword(IDLE, valid())).rejects.toThrow(
      "REDIRECT:/login?notice=password-updated",
    );
  });

  it.each([
    ["do not match", { password: PASSWORD, confirmPassword: `${PASSWORD}x` }, "confirmPassword"],
    ["are too short", { password: "short", confirmPassword: "short" }, "password"],
    ["are too long", { password: "p".repeat(73), confirmPassword: "p".repeat(73) }, "password"],
    ["are missing", { password: "", confirmPassword: "" }, "password"],
  ])("refuses passwords that %s, without contacting Supabase", async (_label, values, field) => {
    const supabase = fakeSupabase();
    shared.client = supabase;
    const result = await updatePassword(IDLE, form(values));
    expect(result.status).toBe("error");
    expect(result.fieldErrors).toHaveProperty(field);
    expect(supabase.auth.getUser).not.toHaveBeenCalled();
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    ["no session at all", { user: null }],
    ["an ordinary password login", { amr: [{ method: "password", timestamp: seconds() - 30 }] }],
    [
      "a recovery link opened too long ago",
      { amr: [{ method: "recovery", timestamp: seconds() - 3600 }] },
    ],
    ["a token without the amr claim", { amr: undefined }],
  ] as Array<[string, FakeOptions]>)("refuses %s", async (_label, options) => {
    const supabase = fakeSupabase(options);
    shared.client = supabase;
    const result = await updatePassword(IDLE, valid());
    expect(result).toEqual({ status: "expired", message: PASSWORD_UPDATE_MESSAGES.expired });
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it("reports a reused or weak password on the field and keeps the session", async () => {
    for (const [code, reason] of [
      ["same_password", "same"],
      ["weak_password", "weak"],
    ] as const) {
      const supabase = fakeSupabase({ updateError: { code, status: 422 } });
      shared.client = supabase;
      const result = await updatePassword(IDLE, valid());
      expect(result).toEqual({
        status: "error",
        fieldErrors: { password: PASSWORD_UPDATE_MESSAGES[reason] },
      });
      expect(supabase.auth.signOut).not.toHaveBeenCalled();
    }
  });

  it("treats a session that Supabase no longer accepts as an expired link", async () => {
    const supabase = fakeSupabase({ updateError: { code: "session_not_found", status: 403 } });
    shared.client = supabase;
    const result = await updatePassword(IDLE, valid());
    expect(result).toEqual({ status: "expired", message: PASSWORD_UPDATE_MESSAGES.expired });
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it("never logs or returns the password", async () => {
    shared.client = fakeSupabase({ updateError: { code: "unexpected_failure", status: 500 } });
    const result = await updatePassword(IDLE, valid());
    expect(result.status).toBe("error");
    expect(JSON.stringify(result)).not.toContain(PASSWORD);
    expect(errorLog).toHaveBeenCalled();
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(PASSWORD);
  });

  it("explains itself when Supabase is not connected", async () => {
    shared.client = null;
    const result = await updatePassword(IDLE, valid());
    expect(result.status).toBe("error");
    expect(result.message).toContain("Supabase");
  });
});

describe("logOut", () => {
  it("ends the session in this browser only and returns to the login page", async () => {
    const supabase = fakeSupabase();
    shared.client = supabase;
    await expect(logOut()).rejects.toThrow("REDIRECT:/login");
    // Signing out everywhere is reserved for a password change.
    expect(supabase.auth.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  });

  it("removes a recovery proof left in the browser", async () => {
    shared.client = fakeSupabase();
    expect(shared.cookies.has(RECOVERY_MARKER_COOKIE)).toBe(true);
    await expect(logOut()).rejects.toThrow("REDIRECT:/login");
    expect(shared.cookies.has(RECOVERY_MARKER_COOKIE)).toBe(false);
  });

  it("still returns to the login page when Supabase is not connected", async () => {
    shared.client = null;
    await expect(logOut()).rejects.toThrow("REDIRECT:/login");
  });
});
