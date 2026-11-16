import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The /auth/confirm route, run for real with Supabase and the Next.js request
 * APIs replaced by fakes. What matters here: the recovery marker, which is the
 * only thing that unlocks /reset-password, is set for a verified recovery link
 * and for nothing else.
 */

const shared = vi.hoisted(() => ({
  client: null as unknown,
  cookies: new Map<string, string>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next/headers", () => ({
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

import type { NextRequest } from "next/server";

import { GET } from "@/app/auth/confirm/route";
import { RECOVERY_MARKER_COOKIE } from "@/lib/auth/password-reset";

const SESSION_ID = "session-1";

function fakeSupabase(options: { method?: string; verifyFails?: boolean; sessionId?: unknown }) {
  const { method = "otp", verifyFails = false } = options;
  const sessionId = "sessionId" in options ? options.sessionId : SESSION_ID;
  const outcome = async () => ({ error: verifyFails ? { code: "otp_expired" } : null });
  return {
    auth: {
      verifyOtp: vi.fn(outcome),
      exchangeCodeForSession: vi.fn(outcome),
      getClaims: vi.fn(async () => ({
        data: { claims: { session_id: sessionId, amr: [{ method, timestamp: 1 }] } },
      })),
    },
  };
}

/** Runs the route and returns where it redirected to. */
async function open(query: string): Promise<string> {
  const request = { nextUrl: new URL(`http://localhost:3000/auth/confirm?${query}`) };
  try {
    await GET(request as unknown as NextRequest);
  } catch (error) {
    const message = (error as Error).message;
    if (message.startsWith("REDIRECT:")) return message.slice("REDIRECT:".length);
    throw error;
  }
  throw new Error("the route did not redirect");
}

beforeEach(() => {
  shared.cookies = new Map();
});

describe("/auth/confirm and the recovery marker", () => {
  it("marks the session of a verified recovery token and opens the reset page", async () => {
    const supabase = fakeSupabase({});
    shared.client = supabase;
    expect(await open("token_hash=abc&type=recovery")).toBe("/reset-password");
    expect(supabase.auth.verifyOtp).toHaveBeenCalledExactlyOnceWith({
      type: "recovery",
      token_hash: "abc",
    });
    expect(shared.cookies.get(RECOVERY_MARKER_COOKIE)).toBe(SESSION_ID);
  });

  it.each(["magiclink", "email", "signup", "invite", "email_change"])(
    "does not mark a %s token, whose session carries the same otp method",
    async (type) => {
      shared.client = fakeSupabase({});
      expect(await open(`token_hash=abc&type=${type}`)).toBe("/app");
      expect(shared.cookies.has(RECOVERY_MARKER_COOKIE)).toBe(false);
    },
  );

  it("marks a code link only when the Auth server recorded a recovery", async () => {
    shared.client = fakeSupabase({ method: "recovery" });
    expect(await open("code=abc")).toBe("/reset-password");
    expect(shared.cookies.get(RECOVERY_MARKER_COOKIE)).toBe(SESSION_ID);
  });

  it.each(["magiclink", "email/signup", "oauth", "otp"])(
    "ignores type=recovery added to a %s code link",
    async (method) => {
      shared.client = fakeSupabase({ method });
      expect(await open("code=abc&type=recovery")).toBe("/app");
      expect(shared.cookies.has(RECOVERY_MARKER_COOKIE)).toBe(false);
    },
  );

  it("removes an earlier marker when another kind of link is opened", async () => {
    shared.cookies.set(RECOVERY_MARKER_COOKIE, "an-older-session");
    shared.client = fakeSupabase({});
    expect(await open("token_hash=abc&type=magiclink")).toBe("/app");
    expect(shared.cookies.has(RECOVERY_MARKER_COOKIE)).toBe(false);
  });

  it("sets no marker when the link is invalid, expired or already used", async () => {
    shared.client = fakeSupabase({ verifyFails: true });
    expect(await open("token_hash=abc&type=recovery")).toBe("/forgot-password?notice=link-invalid");
    expect(await open("code=abc")).toBe("/login?notice=link-invalid");
    expect(shared.cookies.has(RECOVERY_MARKER_COOKIE)).toBe(false);
  });

  it("sets no marker when the verified token carries no session id", async () => {
    shared.client = fakeSupabase({ sessionId: undefined });
    expect(await open("token_hash=abc&type=recovery")).toBe("/app");
    expect(shared.cookies.has(RECOVERY_MARKER_COOKIE)).toBe(false);
  });

  it("never follows a destination outside the workspace", async () => {
    shared.client = fakeSupabase({});
    for (const next of ["https://evil.example/", "//evil.example", "/\\evil.example"]) {
      expect(await open(`token_hash=abc&type=email&next=${encodeURIComponent(next)}`)).toBe("/app");
    }
  });

  it("verifies nothing for an unknown type or without Supabase", async () => {
    const supabase = fakeSupabase({});
    shared.client = supabase;
    expect(await open("token_hash=abc&type=other")).toBe("/login?notice=link-invalid");
    expect(supabase.auth.verifyOtp).not.toHaveBeenCalled();
    shared.client = null;
    expect(await open("token_hash=abc&type=recovery")).toBe("/forgot-password?notice=link-invalid");
  });
});
