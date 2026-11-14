import { expect, type Locator, type Page } from "@playwright/test";

/** "฿1,250.50", "−฿300.00" or "+฿45.00" → satang as an integer. */
export function toSatang(text: string): number {
  const negative = /[−-]/.test(text);
  const digits = text.replace(/[^\d.]/g, "");
  const [baht, fraction = "0"] = digits.split(".");
  const satang = Number(baht) * 100 + Number(fraction.padEnd(2, "0"));
  return negative ? -satang : satang;
}

export async function readSatang(locator: Locator): Promise<number> {
  return toSatang((await locator.textContent()) ?? "");
}

export async function readSummary(page: Page) {
  return {
    net: await readSatang(page.getByTestId("net-result")),
    income: await readSatang(page.getByTestId("total-income")),
    expense: await readSatang(page.getByTestId("total-expense")),
    count: Number(await page.getByTestId("transaction-count").textContent()),
  };
}

export interface NewTransaction {
  type?: "รายรับ" | "รายจ่าย";
  amount: string;
  category: string;
  description: string;
  date?: string;
}

/** Fills the add/edit dialog. Does not submit. */
export async function fillTransaction(dialog: Locator, values: Partial<NewTransaction>) {
  if (values.type) await dialog.getByRole("radio", { name: values.type }).check();
  if (values.amount !== undefined) await dialog.getByLabel("จำนวนเงิน (บาท)").fill(values.amount);
  if (values.date) await dialog.getByLabel("วันที่").fill(values.date);
  if (values.category) await dialog.getByLabel("หมวดหมู่").selectOption({ label: values.category });
  if (values.description !== undefined)
    await dialog.getByLabel("รายละเอียด").fill(values.description);
}

export async function addTransaction(page: Page, values: NewTransaction) {
  await page.getByRole("button", { name: "เพิ่มรายการ", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await fillTransaction(dialog, values);
  await dialog.getByRole("button", { name: "บันทึกรายการ" }).click();
  await expect(dialog).toBeHidden();
}

/** Follows a main-menu link: the top bar on desktop, the bottom tab bar on a phone. */
export async function goTo(page: Page, label: "ภาพรวม" | "รายการ" | "วิเคราะห์" | "หมวดหมู่") {
  await page.getByRole("navigation", { name: "เมนูหลัก" }).getByRole("link", { name: label }).click();
  await expect(page.getByRole("heading", { level: 1, name: label })).toBeVisible();
}

/** A transaction in the list: a table row on desktop, a list item on a phone. */
export function transactionRow(page: Page, isMobile: boolean, description: string): Locator {
  return page
    .getByRole(isMobile ? "listitem" : "row")
    .filter({ hasText: description })
    .first();
}

/** On a phone the filters sit behind a toggle. */
export async function showFilters(page: Page, isMobile: boolean) {
  if (!isMobile) return;
  const toggle = page.getByRole("button", { name: /^ตัวกรอง/ });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
}

export async function resultCount(page: Page): Promise<number> {
  const text = (await page.getByTestId("result-count").textContent()) ?? "";
  return Number(/พบ\s*(\d+)/.exec(text)?.[1] ?? Number.NaN);
}

/**
 * Finds elements that stick out past the right edge of the viewport and are
 * not inside a container that scrolls or clips them. An empty list means the
 * page has no horizontal overflow.
 */
export async function overflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const offenders: string[] = [];
    for (const element of document.querySelectorAll<HTMLElement>("body *")) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right <= viewport + 1 && rect.left >= -1) continue;

      let contained = false;
      for (
        let parent = element.parentElement;
        parent && parent !== document.body;
        parent = parent.parentElement
      ) {
        const style = getComputedStyle(parent);
        if (style.overflowX !== "visible" || style.position === "fixed") {
          contained = true;
          break;
        }
      }
      const own = getComputedStyle(element);
      if (contained || own.position === "fixed" || element.classList.contains("visually-hidden"))
        continue;
      offenders.push(`${element.tagName.toLowerCase()}.${element.className}`.slice(0, 80));
    }
    return offenders.slice(0, 5);
  });
}
