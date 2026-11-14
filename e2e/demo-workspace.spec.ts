import { expect, test } from "@playwright/test";

import {
  addTransaction,
  fillTransaction,
  goTo,
  overflowingElements,
  readSummary,
  resultCount,
  showFilters,
  transactionRow,
} from "./helpers";

/**
 * These tests drive the public demo workspace. It renders the same screens,
 * forms, validation and calculations as the signed-in app, backed by an in-tab
 * store instead of the database. They prove the interface and the arithmetic;
 * persistence to PostgreSQL is covered by tests/integration (schema and RLS)
 * and by e2e/auth-live.spec.ts, which needs a Supabase test project.
 */

test.describe("demo: getting in", () => {
  test("the landing page leads to a clearly labelled demo", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByRole("link", { name: "ลองใช้ตัวอย่าง" }).click();
    await expect(page).toHaveURL(/\/demo$/);
    await expect(page.getByText("โหมดตัวอย่าง", { exact: true })).toBeVisible();
    await expect(page.getByText(/ไม่ถูกบันทึกลงฐานข้อมูล/).first()).toBeVisible();
  });

  test("the dashboard figures agree with each other", async ({ page }) => {
    await page.goto("/demo");
    const summary = await readSummary(page);
    expect(summary.count).toBeGreaterThan(0);
    expect(summary.net).toBe(summary.income - summary.expense);
    await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "รายการล่าสุด" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "สรุปรายเดือน" })).toBeVisible();
  });
});

test.describe("journey 1: a new account", () => {
  test("starts empty, then the first transaction updates every figure", async ({ page }) => {
    await page.goto("/demo");
    await page.getByRole("button", { name: "เริ่มจากบัญชีว่าง" }).click();

    await expect(page.getByText("ยังไม่มีรายการ", { exact: true })).toBeVisible();
    expect(await readSummary(page)).toEqual({ net: 0, income: 0, expense: 0, count: 0 });
    await expect(page.locator(".stamp")).toHaveCount(0);

    await page.getByRole("button", { name: "เพิ่มรายการแรก" }).click();
    const dialog = page.getByRole("dialog");
    await fillTransaction(dialog, {
      type: "รายรับ",
      amount: "15,000.50",
      category: "ค่าบริการและงานโปรเจกต์",
      description: "งานแรกของบัญชีใหม่",
    });
    await dialog.getByRole("button", { name: "บันทึกรายการ" }).click();
    await expect(dialog).toBeHidden();

    // The demo never claims a database write.
    await expect(page.getByRole("status").filter({ hasText: "ไม่ได้บันทึกลงฐานข้อมูล" })).toBeVisible();
    expect(await readSummary(page)).toEqual({
      net: 1_500_050,
      income: 1_500_050,
      expense: 0,
      count: 1,
    });
    await expect(page.locator(".stamp")).toHaveText("กำไร");
    await expect(page.getByText("งานแรกของบัญชีใหม่")).toBeVisible();
  });

  test("the empty states on the other screens explain themselves", async ({ page, isMobile }) => {
    await page.goto("/demo");
    await page.getByRole("button", { name: "เริ่มจากบัญชีว่าง" }).click();

    await goTo(page, "รายการ");
    await expect(page.getByText("ยังไม่มีรายการ", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "ส่งออก CSV" })).toBeDisabled();

    await goTo(page, "วิเคราะห์");
    await expect(page.getByText("ยังไม่มีข้อมูลให้วิเคราะห์")).toBeVisible();

    if (isMobile) expect(await overflowingElements(page)).toEqual([]);
    await page.getByRole("button", { name: "คืนค่าข้อมูลตัวอย่าง" }).click();
    await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();
  });
});

test.describe("adding transactions", () => {
  test("an expense raises the expense total by exactly its amount", async ({ page }) => {
    await page.goto("/demo");
    const before = await readSummary(page);

    await addTransaction(page, {
      amount: "1,234.56",
      category: "ซอฟต์แวร์และเครื่องมือ",
      description: "ค่าทดสอบระบบอัตโนมัติ",
    });

    const after = await readSummary(page);
    expect(after.expense).toBe(before.expense + 123_456);
    expect(after.income).toBe(before.income);
    expect(after.net).toBe(before.net - 123_456);
    expect(after.count).toBe(before.count + 1);
  });

  test("invalid input is explained and nothing is added", async ({ page }) => {
    await page.goto("/demo");
    const before = await readSummary(page);

    await page.getByRole("button", { name: "เพิ่มรายการ", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "บันทึกรายการ" }).click();

    await expect(dialog.getByText("กรอกจำนวนเงิน")).toBeVisible();
    await expect(dialog.getByText("เลือกหมวดหมู่", { exact: true }).last()).toBeVisible();
    await expect(dialog.getByText("กรอกรายละเอียดของรายการ")).toBeVisible();
    await expect(dialog.getByLabel("จำนวนเงิน (บาท)")).toBeFocused();
    await expect(dialog.getByLabel("จำนวนเงิน (บาท)")).toHaveAttribute("aria-invalid", "true");

    for (const bad of ["abc", "0", "-50", "12.345"]) {
      await dialog.getByLabel("จำนวนเงิน (บาท)").fill(bad);
      await expect(dialog.getByText(/จำนวนเงินต้องมากกว่า 0/)).toBeVisible();
    }

    await dialog.getByRole("button", { name: "ยกเลิก" }).click();
    await expect(dialog).toBeHidden();
    expect(await readSummary(page)).toEqual(before);
  });

  test("a double click on save creates one transaction, not two", async ({ page }) => {
    await page.goto("/demo");
    const before = await readSummary(page);

    await page.getByRole("button", { name: "เพิ่มรายการ", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await fillTransaction(dialog, {
      amount: "500",
      category: "เดินทางและขนส่ง",
      description: "ค่าแท็กซี่กดสองครั้ง",
    });
    await dialog.getByRole("button", { name: "บันทึกรายการ" }).dblclick();
    await expect(dialog).toBeHidden();
    // The second tap must not fall through to the page underneath (on a phone,
    // the bottom tab bar sits right below the save button).
    await expect(page).toHaveURL(/\/demo$/);
    await expect(page.getByRole("heading", { level: 1, name: "ภาพรวม" })).toBeVisible();

    const after = await readSummary(page);
    expect(after.count).toBe(before.count + 1);
    expect(after.expense).toBe(before.expense + 50_000);
  });

  test("the category list follows the chosen type", async ({ page }) => {
    await page.goto("/demo");
    await page.getByRole("button", { name: "เพิ่มรายการ", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const category = dialog.getByLabel("หมวดหมู่");

    await expect(category.getByRole("option", { name: "ค่าเช่าและสถานที่" })).toBeAttached();
    await expect(category.getByRole("option", { name: "ขายสินค้า" })).toHaveCount(0);

    await dialog.getByRole("radio", { name: "รายรับ" }).check();
    await expect(category.getByRole("option", { name: "ขายสินค้า" })).toBeAttached();
    await expect(category.getByRole("option", { name: "ค่าเช่าและสถานที่" })).toHaveCount(0);
  });

  test("Escape closes the dialog and focus returns to the button that opened it", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "keyboard behaviour is checked on desktop");
    await page.goto("/demo");
    const opener = page.getByRole("button", { name: "เพิ่มรายการ", exact: true });
    await opener.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(opener).toBeFocused();

    // The same must hold when the dialog is closed with its own button.
    await opener.click();
    await page.getByRole("dialog").getByRole("button", { name: "ยกเลิก" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(opener).toBeFocused();
  });
});

test.describe("journey 2: managing transactions", () => {
  test("filter, edit, see the dashboard change, then delete", async ({ page, isMobile }) => {
    await page.goto("/demo");
    const start = await readSummary(page);
    await addTransaction(page, {
      amount: "2,000",
      category: "การตลาดและโฆษณา",
      description: "โบรชัวร์งานแสดงสินค้า",
    });

    // Filter down to the new row.
    await goTo(page, "รายการ");
    const total = await resultCount(page);
    await page.getByRole("searchbox", { name: "ค้นหา" }).fill("โบรชัวร์");
    await expect(page.getByTestId("result-count")).toContainText("พบ 1 รายการ");
    const row = transactionRow(page, isMobile, "โบรชัวร์งานแสดงสินค้า");
    await expect(row).toContainText("−฿2,000.00");

    // Edit it.
    await page.getByRole("button", { name: "แก้ไข โบรชัวร์งานแสดงสินค้า" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "แก้ไขรายการ" })).toBeVisible();
    await expect(dialog.getByLabel("จำนวนเงิน (บาท)")).toHaveValue("2000.00");
    await fillTransaction(dialog, { amount: "3,500.25", description: "โบรชัวร์และนามบัตร" });
    await dialog.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
    await expect(dialog).toBeHidden();
    await expect(transactionRow(page, isMobile, "โบรชัวร์และนามบัตร")).toContainText("−฿3,500.25");

    // The dashboard reflects the edited amount, not the original one.
    await goTo(page, "ภาพรวม");
    const edited = await readSummary(page);
    expect(edited.expense).toBe(start.expense + 350_025);
    expect(edited.count).toBe(start.count + 1);

    // Delete it: cancelling keeps it, confirming removes it.
    await goTo(page, "รายการ");
    await page.getByRole("button", { name: "ลบ โบรชัวร์และนามบัตร" }).click();
    const confirm = page.getByRole("dialog");
    await expect(confirm).toContainText("ลบรายการนี้หรือไม่");
    await confirm.getByRole("button", { name: "ยกเลิก" }).click();
    await expect(confirm).toBeHidden();
    await expect(transactionRow(page, isMobile, "โบรชัวร์และนามบัตร")).toBeVisible();

    await page.getByRole("button", { name: "ลบ โบรชัวร์และนามบัตร" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "ลบรายการ" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("โบรชัวร์และนามบัตร")).toHaveCount(0);
    await expect.poll(() => resultCount(page)).toBe(total - 1);

    // Back where we started.
    await goTo(page, "ภาพรวม");
    expect(await readSummary(page)).toEqual(start);
  });
});

test.describe("transaction history", () => {
  test("filters by type, category and date range", async ({ page, isMobile }) => {
    await page.goto("/demo/transactions");
    const all = await resultCount(page);
    await showFilters(page, isMobile);

    await page.getByLabel("ประเภท").selectOption({ label: "รายรับ" });
    await expect.poll(() => resultCount(page)).toBeLessThan(all);
    const income = await resultCount(page);
    expect(income).toBeGreaterThan(0);
    await expect(page.getByTestId("result-count")).toContainText(`จากทั้งหมด ${all} รายการ`);
    // Every visible amount is an income.
    const amounts = await page
      .locator(".fig:visible")
      .filter({ hasText: /^[+−]฿/ })
      .allTextContents();
    expect(amounts.length).toBeGreaterThan(0);
    expect(amounts.every((text) => text.startsWith("+"))).toBe(true);

    await page.getByLabel("ประเภท").selectOption({ label: "ทุกประเภท" });
    await page.getByLabel("หมวดหมู่").selectOption({ label: "ค่าเช่าและสถานที่" });
    await expect.poll(() => resultCount(page)).toBeLessThan(income);
    const rent = await resultCount(page);
    expect(rent).toBeGreaterThan(0);

    // A date range that cannot contain anything.
    await page.getByLabel("ตั้งแต่วันที่").fill("2001-01-01");
    await page.getByLabel("ถึงวันที่").fill("2001-01-31");
    await expect(page.getByText("ไม่พบรายการที่ตรงกับตัวกรอง")).toBeVisible();
    await page.getByRole("button", { name: "ล้างตัวกรอง" }).click();
    await expect.poll(() => resultCount(page)).toBe(all);
  });

  test("search with no match shows an empty state that can be cleared", async ({ page }) => {
    await page.goto("/demo/transactions");
    const all = await resultCount(page);
    await page.getByRole("searchbox", { name: "ค้นหา" }).fill("ไม่มีรายการชื่อนี้แน่นอน");
    await expect(page.getByText("ไม่พบรายการที่ตรงกับตัวกรอง")).toBeVisible();
    await expect(page.getByRole("button", { name: "ส่งออก CSV" })).toBeDisabled();
    await page.getByRole("button", { name: "ล้างตัวกรอง" }).click();
    await expect.poll(() => resultCount(page)).toBe(all);
  });

  test("sorts by amount, and the view survives a reload through the URL", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/demo/transactions");
    await showFilters(page, isMobile);
    await page.getByLabel("เรียงตาม").selectOption({ label: "จำนวนเงิน มากไปน้อย" });
    await page.getByLabel("ประเภท").selectOption({ label: "รายจ่าย" });

    const firstAmounts = async () =>
      (
        await page
          .locator(".fig:visible")
          .filter({ hasText: /^[+−]฿/ })
          .allTextContents()
      )
        .slice(0, 8)
        .map((text) => Number(text.replace(/[^\d.]/g, "")));

    // Wait for the list to settle into descending order, then keep that order for the reload check.
    const isDescending = (values: number[]) =>
      values.length > 1 &&
      values.every((value, index) => index === 0 || values[index - 1] >= value);
    await expect.poll(async () => isDescending(await firstAmounts())).toBe(true);
    const sorted = await firstAmounts();
    expect(sorted).toEqual([...sorted].sort((a, b) => b - a));
    await expect(page).toHaveURL(/type=expense/);
    await expect(page).toHaveURL(/sort=amount-desc/);

    await page.reload();
    await showFilters(page, isMobile);
    await expect(page.getByLabel("ประเภท")).toHaveValue("expense");
    await expect(page.getByLabel("เรียงตาม")).toHaveValue("amount-desc");
    await expect.poll(firstAmounts).toEqual(sorted);
  });

  test("exports the filtered rows as a UTF-8 CSV that Excel can read", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/demo/transactions");
    const all = await resultCount(page);
    await showFilters(page, isMobile);
    await page.getByLabel("หมวดหมู่").selectOption({ label: "ซอฟต์แวร์และเครื่องมือ" });
    await expect.poll(() => resultCount(page)).toBeLessThan(all);
    const expected = await resultCount(page);
    expect(expected).toBeGreaterThan(0);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "ส่งออก CSV" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^transactions-\d{4}-\d{2}-\d{2}\.csv$/);

    const chunks: Buffer[] = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
    const bytes = Buffer.concat(chunks);
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);

    const lines = bytes.toString("utf8").slice(1).trimEnd().split("\r\n");
    expect(lines[0]).toBe("วันที่,ประเภท,หมวดหมู่,รายละเอียด,จำนวนเงิน (บาท)");
    expect(lines).toHaveLength(expected + 1);
    expect(lines.slice(1).every((line) => line.includes("ซอฟต์แวร์และเครื่องมือ"))).toBe(true);
    expect(lines[1]).toMatch(/^\d{4}-\d{2}-\d{2},รายจ่าย,.+,\d+\.\d{2}$/);
  });
});

test.describe("journey 3: analysis", () => {
  test("charts and their data tables follow the selected period", async ({ page }) => {
    await page.goto("/demo/analytics");
    await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible();
    await expect(page.locator(".recharts-line").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "รายจ่ายตามหมวดหมู่" })).toBeVisible();

    const monthly = page.locator("figure").first();
    await monthly.getByText("ดูข้อมูลเป็นตาราง").click();
    await expect(monthly.locator("tbody tr")).toHaveCount(6);

    await page.getByLabel("ช่วงเวลา").selectOption({ label: "12 เดือนล่าสุด" });
    await expect(monthly.locator("tbody tr")).toHaveCount(12);
    await expect(page).toHaveURL(/range=12m/);

    // Each chart has a text alternative.
    await expect(page.getByRole("img", { name: /แผนภูมิแท่ง/ })).toBeVisible();
    await expect(page.getByRole("img", { name: /แผนภูมิเส้น/ })).toBeVisible();
  });

  test("the dashboard period selector changes the statement", async ({ page }) => {
    await page.goto("/demo");
    const thisMonth = await readSummary(page);
    await page.getByLabel("ช่วงเวลา").selectOption({ label: "ทั้งหมด" });
    const all = await readSummary(page);
    expect(all.count).toBeGreaterThan(thisMonth.count);
    expect(all.net).toBe(all.income - all.expense);
    await expect(page).toHaveURL(/period=all/);

    await page.getByLabel("ช่วงเวลา").selectOption({ label: "เดือนที่แล้ว" });
    const lastMonth = await readSummary(page);
    expect(lastMonth.net).toBe(lastMonth.income - lastMonth.expense);
    expect(lastMonth.count).toBeLessThan(all.count);
  });
});

test.describe("categories", () => {
  test("create, reject a duplicate, rename, use, protect and delete", async ({ page }) => {
    await page.goto("/demo/categories");

    const name = page.getByLabel("ชื่อหมวดหมู่");
    await name.fill("ค่าอบรมและสัมมนา");
    await page.getByRole("button", { name: "เพิ่มหมวดหมู่" }).click();
    const created = page.getByRole("listitem").filter({ hasText: "ค่าอบรมและสัมมนา" });
    await expect(created).toContainText("ยังไม่มีรายการใช้หมวดนี้");

    // The same name again, differing only by spaces, is refused.
    await name.fill("  ค่าอบรมและสัมมนา ");
    await page.getByRole("button", { name: "เพิ่มหมวดหมู่" }).click();
    await expect(page.getByText("มีหมวดหมู่ชื่อนี้ในประเภทเดียวกันอยู่แล้ว")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "ค่าอบรมและสัมมนา" })).toHaveCount(1);
    await name.fill("");

    // Rename.
    await page.getByRole("button", { name: "แก้ไขหมวดหมู่ ค่าอบรมและสัมมนา" }).click();
    const editing = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("button", { name: "บันทึก", exact: true }) });
    await editing.getByLabel("ชื่อหมวดหมู่").fill("คอร์สเรียนออนไลน์");
    await editing.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "คอร์สเรียนออนไลน์" })).toBeVisible();

    // Once a transaction uses it, it can no longer be deleted.
    await addTransaction(page, {
      amount: "990",
      category: "คอร์สเรียนออนไลน์",
      description: "คอร์สออกแบบ UX",
    });
    const used = page.getByRole("listitem").filter({ hasText: "คอร์สเรียนออนไลน์" });
    await expect(used).toContainText("ใช้อยู่ 1 รายการ");
    await expect(
      used.getByRole("button", { name: /^ลบหมวดหมู่ คอร์สเรียนออนไลน์ ไม่ได้/ }),
    ).toBeDisabled();

    // A default category that sample data uses is protected too.
    await expect(page.getByRole("button", { name: /^ลบหมวดหมู่ ค่าเช่าและสถานที่ ไม่ได้/ })).toBeDisabled();

    // An unused one is deleted after confirming.
    await name.fill("หมวดชั่วคราว");
    await page.getByRole("button", { name: "เพิ่มหมวดหมู่" }).click();
    await page.getByRole("button", { name: "ลบหมวดหมู่ หมวดชั่วคราว" }).click();
    await page
      .getByRole("group", { name: "ยืนยันการลบหมวดหมู่ หมวดชั่วคราว" })
      .getByRole("button", { name: "ลบหมวดหมู่" })
      .click();
    await expect(page.getByText("หมวดชั่วคราว")).toHaveCount(0);
  });
});

test.describe("responsive layout", () => {
  for (const route of [
    "/",
    "/demo",
    "/demo/transactions",
    "/demo/analytics",
    "/demo/categories",
    "/login",
    "/signup",
  ]) {
    test(`${route} has no horizontal overflow`, async ({ page }) => {
      await page.goto(route);
      await page.evaluate(() => document.fonts.ready);
      expect(await overflowingElements(page)).toEqual([]);
    });
  }

  test("no horizontal overflow at tablet width (768px), and the top navigation is used", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    for (const route of [
      "/",
      "/demo",
      "/demo/transactions",
      "/demo/analytics",
      "/demo/categories",
      "/login",
    ]) {
      await page.goto(route);
      await page.evaluate(() => document.fonts.ready);
      expect(await overflowingElements(page), route).toEqual([]);
    }
    await page.goto("/demo");
    const nav = page.getByRole("navigation", { name: "เมนูหลัก" });
    await expect(nav).toHaveCount(1);
    expect((await nav.boundingBox())!.y).toBeLessThan(200); // the top bar, not the bottom tabs
  });

  test("the right navigation is shown for the screen size and it works", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/demo");
    const navs = page.getByRole("navigation", { name: "เมนูหลัก" });
    await expect(navs).toHaveCount(1); // the other one is hidden, not just off screen

    for (const label of ["รายการ", "วิเคราะห์", "หมวดหมู่", "ภาพรวม"] as const) {
      await goTo(page, label);
      await expect(navs.getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
    }

    if (isMobile) {
      const box = await navs.boundingBox();
      const viewport = page.viewportSize()!;
      expect(box!.y + box!.height).toBeGreaterThan(viewport.height - 2); // pinned to the bottom edge
      for (const link of await navs.getByRole("link").all()) {
        expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test("the add dialog fits the screen and its controls are large enough to tap", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/demo/transactions");
    await page.getByRole("button", { name: "เพิ่มรายการ", exact: true }).click();
    const dialog = page.getByRole("dialog");
    // Measure the resting position, not a frame of the opening animation.
    await dialog.evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished)),
    );
    const box = (await dialog.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);

    if (isMobile) {
      for (const control of [
        dialog.getByLabel("จำนวนเงิน (บาท)"),
        dialog.getByRole("button", { name: "บันทึกรายการ" }),
      ]) {
        expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
    }
  });
});
