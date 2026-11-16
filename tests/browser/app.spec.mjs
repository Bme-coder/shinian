import { test, expect } from "@playwright/test";
test("demo is labeled, editable, saved and restored without overflow", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /让一张截图.*长出新想法/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "看看整理效果" }).click();
  await expect(page.getByText("演示内容 · 未调用 AI")).toBeVisible();
  await page.getByLabel("笔记标题").fill("我的中文灵感与行动");
  await page.getByRole("button", { name: "保存到灵感库", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  await page.getByRole("button", { name: "灵感库", exact: true }).click();
  await page
    .locator(".note-open")
    .filter({ hasText: "我的中文灵感与行动" })
    .click();
  await expect(page.getByLabel("笔记标题")).toHaveValue("我的中文灵感与行动");
  await page.reload();
  await expect(page.getByLabel("笔记标题")).toHaveValue("我的中文灵感与行动");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/mobile-" + test.info().project.name + ".png",
    fullPage: true,
  });
});
test("real screenshot with missing token retains draft and explains configuration", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator("#image-input")
    .setInputFiles({
      name: "screen.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6zsAAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await page.getByLabel("补充一点你的想法").fill("我想从中找到行动");
  await page.getByRole("button", { name: "开始整理", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("访问口令");
  await page.reload();
  await expect(page.getByLabel("补充一点你的想法")).toHaveValue(
    "我想从中找到行动",
  );
  await expect(page.locator(".image-thumb")).toHaveCount(1);
});
test.describe("AI gateway interaction", () => {
  test.use({ serviceWorkers: "block" });
  test("analysis accepts a live-shaped response", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await page.getByLabel("应用访问口令").fill("this-is-a-test-access-token");
    await page.getByRole("button", { name: "保存设置", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("设置已保存");
    await page.getByRole("button", { name: "收集", exact: true }).click();
    await page
      .locator("#image-input")
      .setInputFiles({
        name: "screen.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6zsAAAAAASUVORK5CYII=",
          "base64",
        ),
      });
    await page.route("**/api/analyze", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: {
            title: "真实接口测试",
            category: "学习与研究",
            summary: "根据截图整理的主题。",
            highlights: ["明确来源"],
            todos: ["补充证据"],
            insights: ["尝试分类"],
            tags: ["研究"],
            uncertainty: "",
          },
        }),
      }),
    );
    await page.getByRole("button", { name: "开始整理", exact: true }).click();
    await expect(page.getByLabel("笔记标题")).toHaveValue("真实接口测试");
    await expect(page.getByText("演示内容 · 未调用 AI")).toBeHidden();
  });
});
test("offline shell restores saved note after an online visit", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.getByRole("button", { name: "看看整理效果" }).click();
  await page.getByLabel("笔记标题").fill("离线仍可见");
  await page.getByRole("button", { name: "保存到灵感库", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByLabel("笔记标题")).toHaveValue("离线仍可见");
  await expect(page.locator("#offline-banner")).toBeVisible();
});
test.describe("pending and lifecycle data safety", () => {
  test.use({ serviceWorkers: "block" });
  test("a pending analysis keeps its draft isolated from library navigation", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "看看整理效果" }).click();
    await page
      .getByRole("button", { name: "保存到灵感库", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("已保存");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "＋ 收集下一条灵感" }).click();
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await page.getByLabel("应用访问口令").fill("this-is-a-test-access-token");
    await page.getByRole("button", { name: "保存设置", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("设置已保存");
    await page.getByRole("button", { name: "收集", exact: true }).click();
    await page
      .locator("#image-input")
      .setInputFiles({
        name: "screen.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6zsAAAAAASUVORK5CYII=",
          "base64",
        ),
      });
    await page.getByLabel("补充一点你的想法").fill("当前截图的真实背景");
    let resolveResponse;
    const hold = new Promise((resolve) => (resolveResponse = resolve));
    await page.route("**/api/analyze", async (route) => {
      await hold;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          result: {
            title: "当前主题",
            category: "学习与研究",
            summary: "当前截图摘要。",
            highlights: [],
            todos: [],
            insights: [],
            tags: [],
            uncertainty: "",
          },
        }),
      });
    });
    await page.getByRole("button", { name: "开始整理", exact: true }).click();
    await expect(page.getByRole("button", { name: "取消整理" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "灵感库", exact: true }),
    ).toBeDisabled();
    resolveResponse();
    await expect(page.getByLabel("笔记标题")).toHaveValue("当前主题");
  });
  test("early page lifecycle events do not erase an existing draft before initialization", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByLabel("补充一点你的想法").fill("必须保留的草稿");
    await page.getByRole("button", { name: "开始整理", exact: true }).click();
    await page.addInitScript(() => {
      const original = indexedDB.open.bind(indexedDB);
      indexedDB.open = (...args) => {
        const req = original(...args);
        const proxy = new Proxy(req, {
          set(target, prop, value) {
            if (prop === "onsuccess") {
              target[prop] = (event) =>
                setTimeout(() => value.call(target, event), 120);
            } else target[prop] = value;
            return true;
          },
          get(target, prop) {
            const value = target[prop];
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
        return proxy;
      };
      setTimeout(() => window.dispatchEvent(new Event("pagehide")), 30);
    });
    await page.reload();
    await expect(page.getByLabel("补充一点你的想法")).toHaveValue(
      "必须保留的草稿",
    );
    await page.waitForTimeout(400);
    await page.reload();
    await expect(page.getByLabel("补充一点你的想法")).toHaveValue(
      "必须保留的草稿",
    );
  });
});
test("backup roundtrip keeps note edits and checked actions without overwriting originals", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "看看整理效果" }).click();
  await page.getByLabel("笔记标题").fill("备份往返测试");
  await page.getByLabel("完成行动 1", { exact: true }).check();
  await page.getByRole("button", { name: "保存到灵感库", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已保存");
  await page.getByRole("button", { name: "灵感库", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出备份" }).click();
  const file = await downloadPromise;
  const stream = await file.createReadStream();
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  const buffer = Buffer.concat(chunks),
    backup = JSON.parse(buffer.toString());
  expect(backup.notes[0].title).toBe("备份往返测试");
  expect(backup.notes[0].todos[0].done).toBe(true);
  expect(JSON.stringify(backup)).not.toContain("access-token");
  page.once("dialog", (d) => d.accept());
  await page
    .locator("#import-input")
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer,
    });
  await expect(page.locator("#library-count")).toHaveText("2 条灵感");
});
test("notes handoff offers confirmation and never claims remote save", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "看看整理效果" }).click();
  await page
    .getByRole("button", { name: "存入苹果备忘录", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("文字已复制，准备归档")).toBeVisible();
  await expect(
    page.getByText("是否成功创建，请以备忘录中的结果为准。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "稍后再存", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByLabel("笔记标题")).toHaveValue(
    "好的产品，往往始于一句抱怨",
  );
});
