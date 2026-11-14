// Captures the portfolio screenshots from the running application.
//
//   1. npm run build && npm run start -- --port 3100
//   2. npm run screenshots
//
// Every image is a capture of the real pages. The application screens are taken
// from the public demo workspace, so they show sample data and the demo banner.
// Options: BASE_URL=http://127.0.0.1:3100  OUT_DIR=screenshots

import { mkdir } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const OUT_DIR = path.resolve(process.env.OUT_DIR ?? "screenshots");
const DESKTOP = { width: 1280, height: 720 };
const MOBILE = { width: 375, height: 667 };

const browser = await chromium.launch({ args: ["--lang=th-TH"] });
await mkdir(OUT_DIR, { recursive: true });

async function newPage(viewport, extra = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
    reducedMotion: "reduce",
    ...extra,
  });
  const page = await context.newPage();
  return { context, page };
}

async function open(page, route) {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
}

const save = (page, name) => page.screenshot({ path: path.join(OUT_DIR, name), type: "png" });

async function fillSampleTransaction(page) {
  await page.getByRole("button", { name: "เพิ่มรายการ", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("จำนวนเงิน (บาท)").fill("1,890.00");
  await dialog.getByLabel("หมวดหมู่").selectOption({ label: "ซอฟต์แวร์และเครื่องมือ" });
  await dialog.getByLabel("รายละเอียด").fill("ค่าสมาชิกโปรแกรมออกแบบ รายเดือน");
  return dialog;
}

// 01 cover, 07 features: the public landing page
{
  const { context, page } = await newPage(DESKTOP);
  await open(page, "/");
  await save(page, "01-cover.png");
  await page.locator("#features").evaluate((element) => {
    window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY);
  });
  await save(page, "07-features.png");
  await context.close();
}

// 02 to 05: the workspace screens
{
  const { context, page } = await newPage(DESKTOP);

  await open(page, "/demo");
  await page.locator(".recharts-bar-rectangle").first().waitFor();
  await save(page, "02-dashboard.png");

  await open(page, "/demo/transactions");
  await save(page, "03-transactions.png");

  await fillSampleTransaction(page);
  await save(page, "04-add-transaction.png");
  await page.keyboard.press("Escape");

  await open(page, "/demo/analytics");
  await page.locator(".recharts-line").first().waitFor();
  await save(page, "05-analytics.png");

  await context.close();
}

// 06 mobile: three real 375px captures placed side by side on one 1280x720 sheet
{
  const { context, page } = await newPage(MOBILE, { isMobile: true, hasTouch: true });
  const shots = [];

  await open(page, "/demo");
  shots.push(await page.screenshot({ type: "png" }));

  await open(page, "/demo/transactions");
  shots.push(await page.screenshot({ type: "png" }));

  await fillSampleTransaction(page);
  shots.push(await page.screenshot({ type: "png" }));
  await context.close();

  const sheet = await newPage(DESKTOP);
  // Colours are read from the application's own stylesheet so the sheet matches it.
  await open(sheet.page, "/");
  await sheet.page.evaluate(
    (images) => {
      const body = document.body;
      body.replaceChildren();
      body.className = "desk";
      body.style.cssText =
        "margin:0;height:720px;display:flex;align-items:center;justify-content:space-evenly;overflow:hidden";
      for (const source of images) {
        const image = document.createElement("img");
        image.src = `data:image/png;base64,${source}`;
        image.width = 375;
        image.height = 667;
        image.className = "sheet";
        image.style.cssText = "max-width:none;border-radius:14px";
        body.append(image);
      }
    },
    shots.map((shot) => shot.toString("base64")),
  );
  await sheet.page.waitForFunction(() => [...document.images].every((image) => image.complete));
  await save(sheet.page, "06-mobile.png");
  await sheet.context.close();
}

await browser.close();
console.log(`Saved 7 screenshots to ${OUT_DIR}`);
