import { expect, test } from "@playwright/test";

import { fillTransaction, goTo, transactionRow } from "./helpers";

/**
 * The full authenticated journey against a real Supabase project: real login,
 * real rows in PostgreSQL, checked after a page reload.
 *
 * It writes and deletes rows, so it only runs when ALL of these are true:
 *   - SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY point at a dedicated test project,
 *   - E2E_USER_EMAIL and E2E_USER_PASSWORD name a throwaway account in it,
 *   - E2E_CONFIRM_TEST_PROJECT=yes states that the project is not production.
 * Otherwise every test here is skipped, and reported as skipped, not passed.
 * It only ever touches rows it created itself, under that one test account.
 */

const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;
const configured = Boolean(
  process.env.SUPABASE_URL &&
  process.env.SUPABASE_PUBLISHABLE_KEY &&
  email &&
  password &&
  process.env.E2E_CONFIRM_TEST_PROJECT === "yes",
);

test.describe("signed-in app against Supabase", () => {
  test.skip(
    !configured,
    "Needs a Supabase TEST project, E2E_USER_* and E2E_CONFIRM_TEST_PROJECT=yes (see README, Testing).",
  );
  test.describe.configure({ mode: "serial" });

  async function logIn(page: import("@playwright/test").Page) {
    await page.goto("/login");
    await page.getByLabel("อีเมล").fill(email!);
    await page.getByLabel("รหัสผ่าน").fill(password!);
    await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await expect(page).toHaveURL(/\/app$/);
  }

  test("a wrong password is refused with a clear message", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("อีเมล").fill(email!);
    await page.getByLabel("รหัสผ่าน").fill(`${password}-wrong`);
    await page.getByRole("button", { name: "เข้าสู่ระบบ" }).click();
    await expect(page.getByText("อีเมลหรือรหัสผ่านไม่ถูกต้อง")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("the session persists, and a transaction survives create, edit and delete", async ({
    page,
    isMobile,
  }) => {
    const description = `E2E ${test.info().project.name} ${Date.now()}`;
    await logIn(page);

    // The session cookie is httpOnly: page scripts cannot read the tokens.
    expect(await page.evaluate(() => document.cookie)).not.toContain("auth-token");

    // Create
    await page.getByRole("button", { name: "เพิ่มรายการ", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await fillTransaction(dialog, { type: "รายรับ", amount: "100.00", description });
    await dialog.getByLabel("หมวดหมู่").selectOption({ index: 1 });
    await dialog.getByRole("button", { name: "บันทึกรายการ" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("status").filter({ hasText: "บันทึกรายการแล้ว" })).toBeVisible();

    // Persisted: still there after a full reload, in a session that is still valid.
    await page.goto("/app/transactions");
    await page.getByRole("searchbox", { name: "ค้นหา" }).fill(description);
    await expect(transactionRow(page, isMobile, description)).toContainText("+฿100.00");

    // Edit
    await page.getByRole("button", { name: `แก้ไข ${description}` }).click();
    await fillTransaction(page.getByRole("dialog"), { amount: "250.50" });
    await page.getByRole("dialog").getByRole("button", { name: "บันทึกการแก้ไข" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.reload();
    await page.getByRole("searchbox", { name: "ค้นหา" }).fill(description);
    await expect(transactionRow(page, isMobile, description)).toContainText("+฿250.50");

    // Delete
    await page.getByRole("button", { name: `ลบ ${description}` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "ลบรายการ" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await page.reload();
    await page.getByRole("searchbox", { name: "ค้นหา" }).fill(description);
    await expect(page.getByText(description)).toHaveCount(0);

    // Log out: the workspace is closed again.
    await goTo(page, "ภาพรวม");
    await page.getByRole("button", { name: "ออกจากระบบ" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
  });
});
