import { expect, test } from "@playwright/test";

/**
 * Route protection and the auth forms, as far as they can be exercised without
 * signing in. These run whether or not Supabase is configured.
 */

test.describe("protected routes", () => {
  for (const route of ["/app", "/app/transactions", "/app/analytics", "/app/categories"]) {
    test(`${route} sends a signed-out visitor to the login page`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login(\?|$)/);
      await expect(page.getByRole("heading", { level: 1, name: "เข้าสู่ระบบ" })).toBeVisible();
    });
  }

  test("the redirect is a real HTTP redirect, not a page that renders first", async ({
    request,
  }) => {
    const response = await request.get("/app", { maxRedirects: 0 });
    expect([307, 308, 302, 303]).toContain(response.status());
    expect(response.headers().location).toContain("/login");
  });

  test("a forged session cookie does not open the workspace", async ({
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
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login(\?|$)/);
  });
});

test.describe("login and sign-up forms", () => {
  test("login explains missing and malformed input before sending anything", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await expect(page.getByText("กรอกรหัสผ่าน")).toBeVisible();
    await expect(page.getByLabel("อีเมล")).toBeFocused();
    await expect(page.getByLabel("อีเมล")).toHaveAttribute("aria-invalid", "true");

    await page.getByLabel("อีเมล").fill("not-an-email");
    await page.getByLabel("รหัสผ่าน").fill("whatever123");
    await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await expect(page.getByText(/รูปแบบอีเมลไม่ถูกต้อง/)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("sign-up enforces a display name and a password length", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("อีเมล").fill("owner@example.com");
    await page.getByLabel("รหัสผ่าน").fill("short");
    await page.getByRole("button", { name: "สร้างบัญชี" }).click();
    await expect(page.getByText("กรอกชื่อที่ใช้แสดง")).toBeVisible();
    await expect(page.getByText("รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร")).toBeVisible();
    await expect(page.getByLabel("ชื่อที่ใช้แสดง")).toBeFocused();
  });

  test("password fields are marked up for password managers", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel("รหัสผ่าน")).toHaveAttribute("autocomplete", "current-password");
    await expect(page.getByLabel("รหัสผ่าน")).toHaveAttribute("type", "password");
    await page.goto("/signup");
    await expect(page.getByLabel("รหัสผ่าน")).toHaveAttribute("autocomplete", "new-password");
  });

  test("an off-site return address is never carried into the form", async ({ page }) => {
    for (const next of ["https://evil.example/app", "//evil.example", "/login"]) {
      await page.goto(`/login?next=${encodeURIComponent(next)}`);
      const hidden = page.locator('input[name="next"]');
      if (await hidden.count()) await expect(hidden).toHaveValue("/app");
    }
    await page.goto(`/login?next=${encodeURIComponent("/app/transactions")}`);
    await expect(page.locator('input[name="next"]')).toHaveValue("/app/transactions");
  });

  test("an expired confirmation link lands on the login page with an explanation", async ({
    page,
  }) => {
    await page.goto("/auth/confirm?token_hash=invalid&type=email");
    await expect(page).toHaveURL(/\/login\?notice=link-invalid/);
    await expect(page.getByText(/ลิงก์ยืนยันใช้ไม่ได้หรือหมดอายุแล้ว/)).toBeVisible();
  });
});

test.describe("response headers", () => {
  test("pages are served with the security headers", async ({ request }) => {
    const headers = (await request.get("/")).headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["content-security-policy"]).toContain("connect-src 'self'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("the page declares Thai as its language", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "th");
  });
});
