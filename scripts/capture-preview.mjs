import { chromium } from "@playwright/test";
const browser = await chromium.launch();
for (const [name, width, height] of [
  ["phone", 390, 844],
  ["desktop", 1440, 1000],
]) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  await page.goto("http://127.0.0.1:8787");
  await page.locator("#capture-view").waitFor();
  await page.screenshot({
    path: "docs/preview-" + name + ".png",
    fullPage: true,
  });
  await page.close();
}
await browser.close();
