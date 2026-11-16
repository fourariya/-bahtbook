import { expect, test } from "@playwright/test";

import {
  RECOVERY_MARKER_COOKIE,
  RECOVERY_REQUESTED_MESSAGE,
  RECOVERY_RESENT_MESSAGE,
} from "../src/lib/auth/password-reset";
import { overflowingElements } from "./helpers";

/**
 * Password recovery, as far as it can be driven without reading a real inbox.
 *
 * What these tests cannot do: open the link from a real recovery email. So the
 * final step, a successful password change through a real link, is covered by
 * unit tests with a faked Supabase (tests/unit/password-actions.test.ts) and by
 * the manual steps in the README. It is not claimed here.
 *
 * No test in this file causes an email to be sent: the only recovery request
 * made against Supabase uses an address under the reserved ".invalid" domain
 * that belongs to no account.
 */

const EXPIRED_TEXT = "ลิงก์ตั้งรหัสผ่านใช้ไม่ได้ หมดอายุ หรือถูกใช้ไปแล้ว";

const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
const configured = Boolean(
  supabaseUrl && supabaseKey && email && password && process.env.E2E_CONFIRM_TEST_PROJECT === "yes",
);

test.describe("requesting a recovery link", () => {
  test("the login page offers a clearly marked way to recover a password", async ({ page }) => {
    await page.goto("/login");
    const link = page.getByRole("link", { name: "ลืมรหัสผ่าน?" });
    await expect(link).toBeVisible();
    expect(await link.evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain(
      "underline",
    );
    await link.click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByRole("heading", { level: 1, name: "ลืมรหัสผ่าน" })).toBeVisible();
    await expect(page.getByLabel("อีเมล")).toHaveAttribute("autocomplete", "email");
  });

  test("the link is reachable by keyboard between the password field and the button", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "keyboard order is checked on desktop");
    await page.goto("/login");
    await page.getByLabel("รหัสผ่าน").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "ลืมรหัสผ่าน?" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "เข้าสู่ระบบ" })).toBeFocused();
  });

  test("a missing or malformed email is explained before anything is sent", async ({ page }) => {
    await page.goto("/forgot-password");
    const submit = page.getByRole("button", { name: "ส่งลิงก์ตั้งรหัสผ่านใหม่" });

    await submit.click();
    await expect(page.getByText("รูปแบบอีเมลไม่ถูกต้อง", { exact: false })).toBeVisible();
    await expect(page.getByLabel("อีเมล")).toBeFocused();
    await expect(page.getByLabel("อีเมล")).toHaveAttribute("aria-invalid", "true");

    for (const bad of ["plain", "a@", "a b@c.co"]) {
      await page.getByLabel("อีเมล").fill(bad);
      await submit.click();
      await expect(page.getByText(/รูปแบบอีเมลไม่ถูกต้อง/)).toBeVisible();
      await expect(page.getByText("ตรวจสอบอีเมลของคุณ")).toHaveCount(0);
    }
    await expect(page).toHaveURL(/\/forgot-password$/);
  });

  test("the page links back to login and fits a phone screen", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.evaluate(() => document.fonts.ready);
    expect(await overflowingElements(page)).toEqual([]);
    await page.getByRole("link", { name: "กลับไปเข้าสู่ระบบ" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("recovery links that cannot be used", () => {
  test("an invalid, expired or already used link starts no session and explains itself", async ({
    page,
  }) => {
    await page.goto("/auth/confirm?token_hash=not-a-real-token&type=recovery");
    await expect(page).toHaveURL(/\/forgot-password\?notice=link-invalid$/);
    await expect(page.getByRole("status").filter({ hasText: "ลิงก์ตั้งรหัสผ่านใช้ไม่ได้" })).toBeVisible();

    // No session was created: the workspace is still closed.
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login(\?|$)/);
  });

  test("a code that is not valid is refused as well", async ({ page }) => {
    await page.goto("/auth/confirm?code=not-a-real-code");
    await expect(page).toHaveURL(/\/login\?notice=link-invalid$/);
  });

  test("a recovery link cannot be used to send the browser to another site", async ({ page }) => {
    for (const next of ["https://evil.example/", "//evil.example", "/\\evil.example"]) {
      await page.goto(
        `/auth/confirm?token_hash=not-a-real-token&type=recovery&next=${encodeURIComponent(next)}`,
      );
      const url = new URL(page.url());
      expect(url.origin).toBe(new URL(test.info().project.use.baseURL!).origin);
      expect(url.pathname).toBe("/forgot-password");
    }
  });

  test("the reset page shows no form without a recovery session", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByRole("heading", { level: 1, name: "ตั้งรหัสผ่านใหม่" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: EXPIRED_TEXT })).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "บันทึกรหัสผ่านใหม่" })).toHaveCount(0);

    await page.evaluate(() => document.fonts.ready);
    expect(await overflowingElements(page)).toEqual([]);

    await page.getByRole("link", { name: "ขอลิงก์ใหม่" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
  });

  test("a forged session cookie does not unlock the reset form", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      {
        name: "sb-fake-auth-token",
        value: "base64-eyJhY2Nlc3NfdG9rZW4iOiJub3QtYS1yZWFsLXRva2VuIn0",
        url: baseURL!,
      },
    ]);
    await page.goto("/reset-password");
    await expect(page.getByRole("alert").filter({ hasText: EXPIRED_TEXT })).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });
});

test.describe("after a password was changed", () => {
  test("the login page confirms it", async ({ page }) => {
    await page.goto("/login?notice=password-updated");
    await expect(
      page.getByRole("status").filter({ hasText: "ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว" }),
    ).toBeVisible();
  });

  test("an unknown notice value is ignored rather than shown", async ({ page }) => {
    await page.goto(`/login?notice=${encodeURIComponent("<b>hello</b>")}`);
    await expect(page.getByText("hello")).toHaveCount(0);
    await page.goto(`/forgot-password?notice=${encodeURIComponent("<b>hello</b>")}`);
    await expect(page.getByText("hello")).toHaveCount(0);
  });
});

test.describe("password recovery against Supabase", () => {
  test.skip(
    !configured,
    "Needs a Supabase TEST project, E2E_USER_* and E2E_CONFIRM_TEST_PROJECT=yes (see README, Testing).",
  );

  test("a request always gets the same confirmation, and no email is sent", async ({ page }) => {
    // Reserved top-level domain: no such account and no such inbox can exist.
    const nobody = `nobody-${test.info().project.name}-${Date.now()}@bahtbook-test.invalid`;

    await page.goto("/forgot-password");
    await page.getByLabel("อีเมล").fill(nobody);
    await page.getByRole("button", { name: "ส่งลิงก์ตั้งรหัสผ่านใหม่" }).click();

    const confirmation = page.getByRole("status").filter({ hasText: "ตรวจสอบอีเมลของคุณ" });
    await expect(confirmation.getByRole("heading", { name: "ตรวจสอบอีเมลของคุณ" })).toBeVisible();
    await expect(confirmation).toContainText(RECOVERY_REQUESTED_MESSAGE);
    await expect(confirmation).toContainText("Spam/Junk");
    // The answer does not repeat the address or say anything about the account.
    await expect(page.locator("main")).not.toContainText(nobody);
    await expect(page.getByText(/ไม่พบบัญชี|ไม่มีบัญชี/)).toHaveCount(0);
    await expect(page.getByLabel("อีเมล")).toHaveCount(0);
  });

  test("the link can be requested again after a 60 second cooldown", async ({ page }) => {
    // Reserved top-level domain again: the repeated requests send no email either.
    const nobody = `nobody-resend-${test.info().project.name}-${Date.now()}@bahtbook-test.invalid`;
    const isAction = (method: string, headers: Record<string, string>) =>
      method === "POST" && "next-action" in headers;

    await page.clock.install();
    await page.goto("/forgot-password");
    await page.getByLabel("อีเมล").fill(nobody);
    await page.getByRole("button", { name: "ส่งลิงก์ตั้งรหัสผ่านใหม่" }).click();
    await expect(page.getByRole("heading", { name: "ตรวจสอบอีเมลของคุณ" })).toBeVisible();

    // Cooldown: disabled, with the seconds left, and it counts down.
    // Located by position, not by name: its label changes while it waits and loads.
    const resend = page.locator('main form button[type="submit"]');
    await expect(resend).toHaveCount(1);
    const feedback = page.locator("[data-resend-feedback]");
    await expect(resend).toBeDisabled();
    await expect(resend).toHaveText(/ส่งลิงก์อีกครั้งได้ใน (60|59|58) วินาที/);
    await expect(feedback).toBeEmpty();
    await page.clock.fastForward(20_000);
    await expect(resend).toHaveText(/ส่งลิงก์อีกครั้งได้ใน (4[0-9]|3[5-9]) วินาที/);
    await expect(resend).toBeDisabled();
    await page.evaluate(() => document.fonts.ready);
    expect(await overflowingElements(page)).toEqual([]);

    await page.clock.fastForward(41_000);
    await expect(resend).toBeEnabled();
    await expect(resend).toHaveText("ส่งลิงก์อีกครั้ง");

    // A repeat that never reaches the server: an error, and it can be retried at once.
    await page.route("**/forgot-password", (route) =>
      isAction(route.request().method(), route.request().headers())
        ? route.abort("connectionfailed")
        : route.fallback(),
    );
    await resend.click();
    await expect(page.getByRole("alert").filter({ hasText: "ส่งคำขอไม่สำเร็จ" })).toBeVisible();
    await expect(resend).toBeEnabled();
    await expect(page.getByRole("heading", { name: "ตรวจสอบอีเมลของคุณ" })).toBeVisible();
    await page.unroute("**/forgot-password");

    // A repeat that goes through: loading, then a generic confirmation and a new cooldown.
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/forgot-password", async (route) => {
      if (isAction(route.request().method(), route.request().headers())) await held;
      await route.fallback();
    });
    await resend.click();
    await expect(resend).toBeDisabled();
    await expect(resend).toHaveText("กำลังส่งคำขอ");
    await expect(page.getByRole("alert").filter({ hasText: "ส่งคำขอไม่สำเร็จ" })).toHaveCount(0);
    release();

    await expect(feedback).toHaveText(RECOVERY_RESENT_MESSAGE);
    await expect(resend).toBeDisabled();
    await expect(resend).toHaveText(/ส่งลิงก์อีกครั้งได้ใน (60|59|58) วินาที/);
    await expect(page.locator("main")).not.toContainText(nobody);
    await expect(page.getByText(/ไม่พบบัญชี|ไม่มีบัญชี/)).toHaveCount(0);
  });

  test("an ordinary logged-in session cannot open the reset form", async ({
    page,
    context,
    baseURL,
  }) => {
    await page.goto("/login");
    await page.getByLabel("อีเมล").fill(email!);
    await page.getByLabel("รหัสผ่าน").fill(password!);
    await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await expect(page).toHaveURL(/\/app$/);

    await page.goto("/reset-password");
    await expect(page.getByRole("alert").filter({ hasText: EXPIRED_TEXT })).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);

    // Nor does a recovery marker added by hand: the session was not started by an emailed link.
    await context.addCookies([
      { name: RECOVERY_MARKER_COOKIE, value: "forged", url: `${baseURL}/reset-password` },
    ]);
    await page.goto("/reset-password");
    await expect(page.getByRole("alert").filter({ hasText: EXPIRED_TEXT })).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);

    // The account is untouched: the same password still logs in.
    await page.goto("/app");
    await page.getByRole("button", { name: "ออกจากระบบ" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("อีเมล").fill(email!);
    await page.getByLabel("รหัสผ่าน").fill(password!);
    await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await expect(page).toHaveURL(/\/app$/);
    await page.getByRole("button", { name: "ออกจากระบบ" }).click();
  });

  test("the session token carries the claim the reset page relies on", async ({ request }) => {
    // The reset page reads `amr` from the verified token. This confirms, against
    // the real Auth server, that the claim exists and has the shape assumed:
    // a list of { method, timestamp in seconds }, here for a password login.
    const response = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      headers: { apikey: supabaseKey },
      data: { email, password },
    });
    expect(response.status(), "sign-in").toBe(200);
    const { access_token: token } = (await response.json()) as { access_token: string };
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as {
      amr?: Array<{ method?: unknown; timestamp?: unknown }>;
      session_id?: unknown;
    };

    // The recovery marker is bound to this claim.
    expect(typeof claims.session_id, "session_id is a string").toBe("string");
    expect(String(claims.session_id).length, "session_id is not empty").toBeGreaterThan(0);

    expect(Array.isArray(claims.amr), "amr is a list").toBe(true);
    expect(claims.amr![0].method).toBe("password");
    const age = Math.floor(Date.now() / 1000) - Number(claims.amr![0].timestamp);
    expect(Math.abs(age), "timestamp is in seconds and current").toBeLessThan(300);

    await request.post(`${supabaseUrl}/auth/v1/logout?scope=local`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` },
    });
  });
});
