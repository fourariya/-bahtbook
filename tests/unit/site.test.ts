import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Deployment rules of the authentication code:
 *   - addresses placed in emails come from SITE_URL and never from a request header;
 *   - when registration is closed, no page offers it and the server refuses it;
 *   - only the landing page and the demo may be indexed.
 */

const shared = vi.hoisted(() => ({
  client: null as unknown,
  headersRead: 0,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  usePathname: () => "/demo",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/headers", () => ({
  // A hostile request: if any code read these, the tests below would show it.
  headers: vi.fn(async () => {
    shared.headersRead += 1;
    return new Headers({
      host: "evil.example",
      "x-forwarded-host": "evil.example",
      "x-forwarded-proto": "https",
    });
  }),
  cookies: vi.fn(async () => ({ get: () => undefined, set: () => {}, getAll: () => [] })),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => shared.client) }));

import { signUp } from "@/app/(auth)/actions";
import LoginPage from "@/app/(auth)/login/page";
import SignUpPage from "@/app/(auth)/signup/page";
import { metadata as demoMetadata } from "@/app/demo/layout";
import { metadata as rootMetadata } from "@/app/layout";
import LandingPage, { metadata as landingMetadata } from "@/app/page";
import { DemoBanner } from "@/components/demo/demo-workspace";
import {
  SIGNUP_CLOSED_MESSAGE,
  confirmRedirectUrl,
  isSignupEnabled,
  trustedSiteUrl,
} from "@/lib/auth/site";

vi.mock("next/font/google", () => ({
  Geist_Mono: () => ({ variable: "font-mono" }),
  IBM_Plex_Sans_Thai: () => ({ variable: "font-sans" }),
}));

const IDLE = { status: "idle" } as const;
const VALID = { displayName: "Owner", email: "owner@example.test", password: "a-long-passphrase" };

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function fakeSupabase() {
  return {
    auth: { signUp: vi.fn(async () => ({ data: { session: null, user: null }, error: null })) },
  };
}

beforeEach(() => {
  shared.headersRead = 0;
  vi.stubEnv("SITE_URL", "https://bahtbook.example.test");
  vi.stubEnv("SIGNUP_ENABLED", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("trustedSiteUrl", () => {
  it.each([
    ["https://bahtbook.example.test", "https://bahtbook.example.test"],
    ["https://bahtbook.example.test/", "https://bahtbook.example.test"],
    ["  https://bahtbook.example.test//  ", "https://bahtbook.example.test"],
    ["https://bahtbook.example.test:8443", "https://bahtbook.example.test:8443"],
    ["HTTPS://Bahtbook.Example.Test", "https://bahtbook.example.test"],
    ["http://localhost:3000", "http://localhost:3000"],
    ["http://127.0.0.1:3100", "http://127.0.0.1:3100"],
  ])("accepts %s", (raw, expected) => {
    expect(trustedSiteUrl(raw)).toBe(expected);
  });

  it.each([
    ["empty", ""],
    ["blank", "   "],
    ["not a URL", "bahtbook.example.test"],
    ["http on a public host", "http://bahtbook.example.test"],
    ["http on a host that only starts with localhost", "http://localhost.evil.example"],
    ["a javascript: address", "javascript:alert(1)"],
    ["a data: address", "data:text/html,hello"],
    ["another scheme", "ftp://bahtbook.example.test"],
    ["credentials", "https://user:pass@bahtbook.example.test"],
    ["a user name that looks like the site", "https://bahtbook.example.test@evil.example"],
    ["a path", "https://bahtbook.example.test/somewhere"],
    ["a query", "https://bahtbook.example.test/?next=//evil.example"],
    ["a fragment", "https://bahtbook.example.test/#x"],
  ])("rejects a value with %s", (_label, raw) => {
    expect(trustedSiteUrl(raw)).toBeNull();
    expect(confirmRedirectUrl(raw)).toBeUndefined();
  });

  it("builds the confirmation address from the trusted origin only", () => {
    expect(confirmRedirectUrl("https://bahtbook.example.test/")).toBe(
      "https://bahtbook.example.test/auth/confirm",
    );
  });
});

describe("signUp and the confirmation link", () => {
  it("sends the configured site as the return address", async () => {
    const supabase = fakeSupabase();
    shared.client = supabase;
    await signUp(IDLE, form(VALID));
    expect(supabase.auth.signUp).toHaveBeenCalledExactlyOnceWith({
      email: VALID.email,
      password: VALID.password,
      options: {
        data: { display_name: VALID.displayName },
        emailRedirectTo: "https://bahtbook.example.test/auth/confirm",
      },
    });
  });

  it.each([
    ["missing", ""],
    ["invalid", "not a url"],
    ["plain http on a public host", "http://bahtbook.example.test"],
    ["carrying a path", "https://bahtbook.example.test/x"],
  ])("never falls back to the Host header when SITE_URL is %s", async (_label, siteUrl) => {
    vi.stubEnv("SITE_URL", siteUrl);
    const supabase = fakeSupabase();
    shared.client = supabase;
    await signUp(IDLE, form(VALID));
    // No address at all: Supabase then uses the Site URL set in the project.
    const [[request]] = supabase.auth.signUp.mock.calls as unknown as [
      [{ options: { emailRedirectTo?: string } }],
    ];
    expect(request.options.emailRedirectTo).toBeUndefined();
    expect(JSON.stringify(request)).not.toContain("evil.example");
    expect(shared.headersRead).toBe(0);
  });
});

describe("isSignupEnabled", () => {
  it("is on unless SIGNUP_ENABLED is exactly false", () => {
    for (const value of [undefined, "", "true", "yes", "1", "0", "off"]) {
      expect(isSignupEnabled(value), String(value)).toBe(true);
    }
    for (const value of ["false", "FALSE", " False "]) {
      expect(isSignupEnabled(value), value).toBe(false);
    }
  });
});

describe("when registration is closed", () => {
  beforeEach(() => {
    vi.stubEnv("SIGNUP_ENABLED", "false");
  });

  it("the Server Action refuses before contacting Supabase", async () => {
    const supabase = fakeSupabase();
    shared.client = supabase;
    const result = await signUp(IDLE, form(VALID));
    expect(result.status).toBe("error");
    expect(result.message).toBe(SIGNUP_CLOSED_MESSAGE);
    expect(JSON.stringify(result)).not.toContain(VALID.password);
    expect(supabase.auth.signUp).not.toHaveBeenCalled();
  });

  it("the landing page offers the demo and login, and no sign-up", () => {
    const html = renderToStaticMarkup(createElement(LandingPage));
    expect(html).not.toContain('href="/signup"');
    expect(html).not.toContain("สมัครใช้งาน");
    expect(html).toContain('href="/demo"');
    expect(html).toContain('href="/login"');
  });

  it("the login page offers the demo, and no sign-up", async () => {
    const html = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({}) }));
    expect(html).not.toContain('href="/signup"');
    expect(html).toContain(SIGNUP_CLOSED_MESSAGE);
    expect(html).toContain('href="/demo"');
    // Logging in still works for accounts that exist.
    expect(html).toContain('name="password"');
  });

  it("the sign-up page shows no form, only an explanation and the demo", () => {
    const html = renderToStaticMarkup(createElement(SignUpPage));
    expect(html).toContain(SIGNUP_CLOSED_MESSAGE);
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
    expect(html).toContain('href="/demo"');
    expect(html).toContain('href="/login"');
  });

  it("the demo banner does not offer sign-up", () => {
    const html = renderToStaticMarkup(
      createElement(DemoBanner, {
        isEmpty: false,
        isSample: true,
        signupEnabled: false,
        onStartEmpty: vi.fn(),
        onRestore: vi.fn(),
      }),
    );
    expect(html).not.toContain('href="/signup"');
    expect(html).toContain("โหมดตัวอย่าง");
  });
});

describe("when registration is open", () => {
  it("the pages offer sign-up as before", async () => {
    expect(renderToStaticMarkup(createElement(LandingPage))).toContain('href="/signup"');
    expect(renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({}) }))).toContain(
      'href="/signup"',
    );
    expect(renderToStaticMarkup(createElement(SignUpPage))).toContain("<form");
    const banner = renderToStaticMarkup(
      createElement(DemoBanner, {
        isEmpty: false,
        isSample: true,
        signupEnabled: true,
        onStartEmpty: vi.fn(),
        onRestore: vi.fn(),
      }),
    );
    expect(banner).toContain('href="/signup"');
  });
});

describe("search engine indexing", () => {
  it("is off by default, so auth pages and the workspace are not indexed", () => {
    expect(rootMetadata.robots).toEqual({ index: false, follow: false });
  });

  it("is on for the landing page and the demo only", () => {
    expect(landingMetadata.robots).toEqual({ index: true, follow: true });
    expect(demoMetadata.robots).toEqual({ index: true, follow: true });
  });
});
