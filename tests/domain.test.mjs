import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeResult,
  formatNote,
  buildShortcutUrl,
  normalizeBaseUrl,
  validateSubmission,
  imageTiles,
} from "../public/lib/domain.js";
const valid = {
  title: "从评论中发现机会",
  category: "产品与创业",
  summary: "观察反复出现的实际问题。",
  highlights: ["先记录需求"],
  todos: ["访谈 3 位用户"],
  insights: ["高频抱怨是线索"],
  tags: ["用户研究"],
  uncertainty: "",
};
test("normalizes valid notes and rejects empty or wrong-shaped AI output", () => {
  assert.equal(normalizeResult(valid).title, valid.title);
  for (const bad of [
    {},
    null,
    { ...valid, title: "" },
    { ...valid, summary: [] },
    { ...valid, todos: {} },
  ])
    assert.throws(() => normalizeResult(bad));
});
test("formats Unicode and preserves edited tasks, context and source caveats", () => {
  const txt = formatNote({
    ...valid,
    todos: [
      { text: "访谈用户", done: true },
      { text: "整理证据", done: false },
    ],
    context: "我想试一试",
    createdAt: "2026-11-16T00:00:00.000Z",
    uncertainty: "下半段不清晰",
  });
  assert.match(txt, /^从评论中发现机会\n/);
  assert.match(txt, /☑ 访谈用户/);
  assert.match(txt, /☐ 整理证据/);
  assert.match(txt, /我想试一试/);
  assert.match(txt, /下半段不清晰/);
  assert.match(txt, /#用户研究/);
});
test("shortcut URL includes name and clipboard only, never note content", () => {
  const u = new URL(buildShortcutUrl("拾念 · 存到备忘录"));
  assert.equal(u.protocol, "shortcuts:");
  assert.equal(u.searchParams.get("name"), "拾念 · 存到备忘录");
  assert.equal(u.searchParams.get("input"), "clipboard");
  assert.equal(u.searchParams.has("text"), false);
});
test("normalizes provider URLs without duplicate endpoint and rejects credential or insecure URLs", () => {
  assert.equal(
    normalizeBaseUrl("https://api.example.com/v1/"),
    "https://api.example.com/v1",
  );
  assert.equal(
    normalizeBaseUrl("https://api.example.com/v1/chat/completions"),
    "https://api.example.com/v1",
  );
  for (const s of [
    "http://api.example.com",
    "https://key@example.com/v1",
    "https://api.example.com/v1?key=secret",
    "file:///tmp/a",
  ])
    assert.throws(() => normalizeBaseUrl(s));
});
test("submission rejects no images, non-image URLs and excessive content", () => {
  const image = "data:image/png;base64,aGVsbG8=";
  assert.equal(
    validateSubmission({ images: [image], context: "你好", focus: "balanced" })
      .images.length,
    1,
  );
  for (const input of [
    { images: [] },
    { images: ["https://example.com/a.png"] },
    { images: [image], context: "x".repeat(6001) },
    { images: Array(17).fill(image) },
  ])
    assert.throws(() => validateSubmission(input));
});
test("long screenshots tile at legible width with overlap and bounded total", () => {
  const normal = imageTiles(1170, 2532);
  assert.equal(normal.length, 1);
  const long = imageTiles(1170, 9000);
  assert.ok(long.length > 1);
  assert.equal(long[0].y, 0);
  assert.ok(long.at(-1).y + long.at(-1).height >= 9000);
  assert.ok(long[1].y < long[0].height);
  assert.throws(() => imageTiles(1170, 100000));
});
