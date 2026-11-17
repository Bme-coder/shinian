import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const url = process.argv[2] || "https://bme-coder.github.io/shinian/";
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  const response = await page.goto(url, { waitUntil: "networkidle" });
  assert.equal(
    response?.status(),
    200,
    "published home page must return HTTP 200",
  );
  await page.locator("#capture-view").waitFor();
  assert.match(await page.title(), /拾念/);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "mobile viewport must not overflow horizontally",
  );

  const manifest = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href");
  const manifestResponse = await page.request.get(new URL(manifest, url).href);
  assert.equal(manifestResponse.status(), 200);
  const manifestData = await manifestResponse.json();
  assert.equal(manifestData.short_name, "拾念");

  const shortcutResponse = await page.request.get(
    new URL("./shortcuts/save-to-notes.shortcut", url).href,
  );
  assert.equal(shortcutResponse.status(), 200);

  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "本机 API 密钥" }).waitFor();
  await page.getByLabel("模型 API 密钥").waitFor();
  await page.screenshot({
    path: "/private/tmp/shinian-published-mobile.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: "收集", exact: true }).click();
  await page.getByRole("button", { name: "看看整理效果" }).click();
  await page.getByText("演示内容 · 未调用 AI").waitFor({ state: "visible" });
  assert.deepEqual(
    failures,
    [],
    "published app should have no uncaught browser errors",
  );
  console.log(
    "PASS " + url + " (PWA manifest, shortcut, 390px layout, demo flow)",
  );
} finally {
  await browser.close();
}
