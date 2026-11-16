export const CATEGORIES = [
  "产品与创业",
  "学习与研究",
  "工作与效率",
  "生活与成长",
  "表达与创作",
  "待整理",
];
export const MAX_BODY_BYTES = 3 * 1024 * 1024;
const FOCUSES = ["balanced", "summary", "actions", "inspiration"];
export function normalizeBaseUrl(value) {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash)
    throw new Error("API 地址必须是不带密钥的 HTTPS 地址");
  return u.href
    .replace(/\/$/, "")
    .replace(/\/(chat\/completions|responses)$/, "");
}
export function validateSubmission(value) {
  if (
    !value ||
    !Array.isArray(value.images) ||
    value.images.length < 1 ||
    value.images.length > 16
  )
    throw new Error("请选择截图，处理后的图片不能超过 16 张");
  if (
    value.images.some(
      (x) =>
        typeof x !== "string" ||
        !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(x),
    )
  )
    throw new Error("截图格式不正确，请重新选择 JPG、PNG 或 WebP 图片");
  const context = value.context ?? "";
  if (typeof context !== "string" || context.length > 6000)
    throw new Error("补充说明最多 6000 字");
  if (!FOCUSES.includes(value.focus ?? "balanced"))
    throw new Error("请选择有效的整理方式");
  return {
    images: value.images,
    context: context.trim(),
    focus: value.focus ?? "balanced",
  };
}
export function normalizeResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("AI 返回的内容格式不完整，请重试");
  const str = (key, required, max) => {
    if (
      typeof value[key] !== "string" ||
      value[key].length > max ||
      (required && !value[key].trim())
    )
      throw new Error("AI 返回的内容格式不完整，请重试");
    return value[key].trim();
  };
  const list = (key, max = 12) => {
    if (
      !Array.isArray(value[key]) ||
      value[key].length > max ||
      value[key].some((x) => typeof x !== "string" || x.length > 2000)
    )
      throw new Error("AI 返回的列表格式不完整，请重试");
    return value[key].map((x) => x.trim()).filter(Boolean);
  };
  return {
    title: str("title", true, 160),
    category: CATEGORIES.includes(value.category) ? value.category : "待整理",
    summary: str("summary", true, 12000),
    highlights: list("highlights"),
    todos: list("todos"),
    insights: list("insights"),
    tags: list("tags", 8)
      .map((x) => x.replace(/^#+/, "").replace(/[\s#]/g, "").slice(0, 40))
      .filter(Boolean),
    uncertainty:
      typeof value.uncertainty === "string"
        ? value.uncertainty.slice(0, 2000).trim()
        : "",
  };
}
export function formatNote(note) {
  const parts = [note.title.trim(), "分类：" + note.category];
  if (note.summary?.trim()) parts.push("摘要\n" + note.summary.trim());
  if (note.highlights?.length)
    parts.push("原文要点\n" + note.highlights.map((t) => "• " + t).join("\n"));
  if (note.todos?.length)
    parts.push(
      "行动清单（AI 建议）\n" +
        note.todos
          .map((t) =>
            typeof t === "string" ? "☐ " + t : (t.done ? "☑ " : "☐ ") + t.text,
          )
          .join("\n"),
    );
  if (note.insights?.length)
    parts.push(
      "对我的启发（AI 推论）\n" + note.insights.map((t) => "• " + t).join("\n"),
    );
  if (note.uncertainty) parts.push("需要核实\n" + note.uncertainty);
  if (note.context?.trim()) parts.push("我的补充\n" + note.context.trim());
  if (note.tags?.length)
    parts.push(note.tags.map((t) => "#" + t.replace(/[\s#]/g, "")).join(" "));
  if (note.createdAt && !Number.isNaN(Date.parse(note.createdAt)))
    parts.push(
      "收集于 " +
        new Date(note.createdAt).toLocaleDateString("zh-CN") +
        " · 拾念\n由 AI 辅助整理，请核对原文。",
    );
  return parts.join("\n\n");
}
export function buildShortcutUrl(name) {
  return (
    "shortcuts://run-shortcut?name=" +
    encodeURIComponent(name?.trim() || "拾念 · 存到备忘录") +
    "&input=clipboard"
  );
}
export function imageTiles(width, height) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 120000000
  )
    throw new Error("图片尺寸过大或无法读取");
  const scale = Math.min(1, 1440 / width);
  const tileHeight = Math.floor(3600 / scale);
  const overlap = Math.round(120 / scale);
  const result = [];
  for (let y = 0; y < height;) {
    const h = Math.min(tileHeight, height - y);
    result.push({
      y,
      height: h,
      width: Math.round(width * scale),
      outputHeight: Math.round(h * scale),
    });
    if (result.length > 16) throw new Error("长截图内容太多，请分几次整理");
    if (y + h >= height) break;
    y += h - overlap;
  }
  return result;
}
