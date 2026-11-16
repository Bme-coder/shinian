import {
  CATEGORIES,
  MAX_BODY_BYTES,
  normalizeResult,
  formatNote,
  buildShortcutUrl,
} from "./lib/domain.js";
import { storage } from "./lib/storage.js";
import { prepareImages } from "./lib/images.js";
const $ = (id) => document.getElementById(id);
const DEFAULT_SHORTCUT = "拾念 · 存到备忘录";
let state = { images: [], context: "", focus: "balanced", note: null },
  settings = { serverUrl: "", shortcutName: DEFAULT_SHORTCUT },
  token = "",
  view = "capture",
  busy = false,
  importing = false,
  initialized = false,
  controller,
  notes = [],
  toastTimer,
  persistTimer,
  persistChain = Promise.resolve();
const demo = {
  title: "好的产品，往往始于一句抱怨",
  category: "产品与创业",
  summary:
    "评论区里那些反复出现的“小麻烦”，往往藏着真实需求。与其急着寻找宏大的创意，不如先记录人们具体在为什么发愁、现在如何解决，再从一个高频且值得解决的问题开始验证。",
  highlights: [
    "关注重复出现的问题，而不只是点赞最多的观点。",
    "区分“听起来很酷”与“愿意为之付出时间或金钱”。",
    "先理解使用场景，再决定做什么产品。",
  ],
  todos: [
    { text: "收集 10 条同类抱怨，按使用场景归组", done: false },
    { text: "找 3 位有这个困扰的人，聊聊他们的解决办法", done: false },
    { text: "用一个最小方案验证需求是否真实", done: false },
  ],
  insights: [
    "下次浏览评论区时，可以有意识地问：这个人真正想完成什么？",
    "我不一定需要一个全新的点子，也可以让一个已有流程更省心。",
  ],
  tags: ["用户研究", "产品灵感", "小步验证"],
  uncertainty: "这是为展示界面而准备的示例，没有分析你的截图。",
  isDemo: true,
};
function toast(text) {
  clearTimeout(toastTimer);
  $("toast").textContent = text;
  $("toast").hidden = false;
  toastTimer = setTimeout(() => ($("toast").hidden = true), 4500);
}
function fail(id, message) {
  $(id).textContent = message;
  $(id).hidden = !message;
}
function storageWarning() {
  $("storage-warning").textContent =
    "当前设备无法保存数据。请先复制或导出重要内容，并检查浏览器储存空间。";
  $("storage-warning").hidden = false;
}
function journal() {
  state.modifiedAt = Date.now();
  try {
    localStorage.setItem(
      "shinian-draft-journal",
      JSON.stringify({
        context: state.context,
        focus: state.focus,
        note: state.note,
        imageIds: state.images.map((x) => x.id),
        modifiedAt: state.modifiedAt,
      }),
    );
  } catch {
    storageWarning();
  }
}
function persist() {
  if (!initialized) return Promise.resolve();
  clearTimeout(persistTimer);
  journal();
  const snapshot = structuredClone(state);
  persistChain = persistChain
    .catch(() => {})
    .then(() => storage.set("draft", snapshot));
  persistChain.catch(storageWarning);
  return persistChain;
}
function schedulePersist() {
  if (!initialized) return;
  journal();
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    void persist();
  }, 250);
}
function showView(next) {
  if (busy && next !== "result") return;
  view = next;
  document
    .querySelectorAll(".view")
    .forEach((el) => (el.hidden = el.id !== next + "-view"));
  document.querySelectorAll(".nav-item").forEach((button) => {
    const active =
      button.dataset.view === next ||
      (next === "result" && button.dataset.view === "capture");
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (next === "library") void loadLibrary();
  if (next === "settings") renderSettings();
  window.scrollTo({ top: 0, behavior: "instant" });
}
function updateOffline() {
  $("offline-banner").hidden = navigator.onLine;
}
function syncContext() {
  state.context = $("context").value;
  $("context-count").textContent = state.context.length + " / 6000";
  schedulePersist();
}
function renderImages() {
  $("images-grid").replaceChildren();
  $("image-count").textContent = state.images.length
    ? state.images.length + " / 6 张截图"
    : "最多 6 张截图";
  state.images.forEach((image, index) => {
    const wrap = document.createElement("div");
    wrap.className = "image-thumb";
    const img = document.createElement("img");
    img.src = image.thumbnail;
    img.alt = "截图 " + (index + 1) + "：" + image.name;
    const badge = document.createElement("span");
    badge.className = "thumb-index";
    badge.textContent = String(index + 1);
    const remove = document.createElement("button");
    remove.className = "remove-image";
    remove.textContent = "×";
    remove.type = "button";
    remove.setAttribute("aria-label", "移除截图 " + (index + 1));
    remove.disabled = busy;
    remove.onclick = () => {
      state.images.splice(index, 1);
      renderImages();
      schedulePersist();
    };
    wrap.append(img, badge, remove);
    $("images-grid").append(wrap);
  });
}
async function addFiles(files) {
  if (busy || importing) return;
  fail("capture-error", "");
  if (state.images.length + files.length > 6) {
    fail("capture-error", "一次最多选择 6 张截图，请分几次整理。");
    return;
  }
  importing = true;
  $("analyze-button").disabled = true;
  try {
    const prepared = await prepareImages(files);
    if ([...state.images, ...prepared].flatMap((x) => x.slices).length > 16)
      throw new Error("长截图分片超过 16 张，请减少截图数量。");
    state.images.push(...prepared);
    renderImages();
    await persist();
  } catch (e) {
    fail("capture-error", e.message);
  } finally {
    importing = false;
    $("analyze-button").disabled = false;
    $("image-input").value = "";
  }
}
function renderTodos() {
  $("todo-list").replaceChildren();
  state.note.todos.forEach((todo, index) => {
    const row = document.createElement("div");
    row.className = "todo-row" + (todo.done ? " done" : "");
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = todo.done;
    check.setAttribute("aria-label", "完成行动 " + (index + 1));
    check.onchange = () => {
      todo.done = check.checked;
      row.classList.toggle("done", todo.done);
      schedulePersist();
    };
    const input = document.createElement("input");
    input.type = "text";
    input.value = todo.text;
    input.maxLength = 2000;
    input.setAttribute("aria-label", "行动 " + (index + 1));
    input.oninput = () => {
      todo.text = input.value;
      schedulePersist();
    };
    const remove = document.createElement("button");
    remove.textContent = "×";
    remove.setAttribute("aria-label", "删除行动 " + (index + 1));
    remove.onclick = () => {
      state.note.todos.splice(index, 1);
      renderTodos();
      schedulePersist();
    };
    row.append(check, input, remove);
    $("todo-list").append(row);
  });
}
function renderResult() {
  const n = state.note;
  if (!n) return;
  $("note-title").value = n.title;
  $("note-category").value = n.category;
  $("note-summary").value = n.summary;
  $("note-highlights").value = n.highlights.join("\n");
  $("note-insights").value = n.insights.join("\n");
  $("note-tags").value = n.tags.join(", ");
  $("note-date").textContent = new Date(n.createdAt).toLocaleDateString(
    "zh-CN",
  );
  $("demo-banner").hidden = !n.isDemo;
  $("uncertainty-block").hidden = !n.uncertainty;
  $("uncertainty-text").textContent = n.uncertainty;
  $("result-status").textContent = n.isDemo ? "演示预览" : "可编辑 · 本地草稿";
  renderTodos();
}
function syncResult() {
  if (!state.note) return;
  Object.assign(state.note, {
    title: $("note-title").value,
    category: $("note-category").value,
    summary: $("note-summary").value,
    highlights: $("note-highlights")
      .value.split("\n")
      .map((x) => x.trim())
      .filter(Boolean),
    insights: $("note-insights")
      .value.split("\n")
      .map((x) => x.trim())
      .filter(Boolean),
    tags: $("note-tags")
      .value.split(/[,，\n]/)
      .map((x) => x.replace(/[\s#]/g, ""))
      .filter(Boolean)
      .slice(0, 8),
    updatedAt: new Date().toISOString(),
  });
  schedulePersist();
}
function setBusy(value) {
  busy = value;
  document.querySelectorAll(".nav-item").forEach((b) => (b.disabled = value));
  $("demo-button").disabled = value;
  $("analyze-button").disabled = value;
  $("analyze-button").classList.toggle("loading", value);
  $("analyze-button").querySelector("span").textContent = value
    ? "正在读图、整理想法…"
    : "开始整理";
  $("cancel-button").hidden = !value;
  $("image-input").disabled = value;
  $("context").disabled = value;
  document.querySelectorAll(".focus-chip").forEach((b) => (b.disabled = value));
  renderImages();
}
async function analyze() {
  if (busy || importing) return;
  fail("capture-error", "");
  if (!state.images.length) {
    fail("capture-error", "先选择至少一张截图，再开始整理。");
    return;
  }
  if (!token) {
    fail(
      "capture-error",
      "请先到「设置」填写应用访问口令，并在服务器配置 AI 服务。",
    );
    return;
  }
  if (!navigator.onLine) {
    fail("capture-error", "当前离线。截图和说明已留在草稿中，联网后再整理。");
    return;
  }
  state.context = $("context").value;
  const body = JSON.stringify({
    images: state.images.flatMap((x) => x.slices),
    context: state.context,
    focus: state.focus,
  });
  if (new Blob([body]).size > MAX_BODY_BYTES) {
    fail(
      "capture-error",
      "这组截图内容较大，请减少图片或把长截图拆成几次整理。",
    );
    return;
  }
  try {
    await persist();
  } catch {
    return;
  }
  controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), 100000);
  setBusy(true);
  try {
    const endpoint = settings.serverUrl
      ? settings.serverUrl.replace(/\/$/, "") + "/api/analyze"
      : new URL("api/analyze", location.href).href;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body,
      signal: controller.signal,
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("应用服务器没有返回可用内容，请检查设置中的服务器地址。");
    }
    if (!response.ok)
      throw new Error(data.error || "整理失败，草稿已保留，请稍后重试。");
    const result = normalizeResult(data.result);
    state.note = {
      ...result,
      todos: result.todos.map((text) => ({ text, done: false })),
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      context: state.context,
      isDemo: false,
    };
    renderResult();
    showView("result");
    await persist();
  } catch (e) {
    fail(
      "capture-error",
      controller.signal.aborted
        ? controller.signal.reason === "timeout"
          ? "整理超时，草稿已保留。"
          : "已取消整理，草稿已保留。"
        : e instanceof TypeError
          ? "暂时无法连接应用服务器。请检查网络、服务器地址与跨域配置；草稿已保留。"
          : e.message,
    );
  } finally {
    clearTimeout(timer);
    setBusy(false);
    controller = null;
  }
}
async function saveNote() {
  syncResult();
  if (!state.note?.title.trim() || !state.note.summary.trim()) {
    toast("请填写笔记标题和摘要。");
    return false;
  }
  try {
    state.note.updatedAt = new Date().toISOString();
    await persist();
    await storage.save({
      ...structuredClone(state.note),
      images: structuredClone(state.images),
    });
    toast("已保存到这台设备的灵感库");
    return true;
  } catch {
    storageWarning();
    return false;
  }
}
async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {}
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  const ok = document.execCommand("copy");
  textarea.remove();
  if (!ok) throw new Error("复制失败，请使用系统分享，或在 HTTPS 网站中重试。");
}
async function handoff() {
  syncResult();
  if (!state.note?.title.trim() || !state.note.summary.trim()) {
    toast("请先填写标题和摘要。");
    return;
  }
  try {
    await copyText(formatNote(state.note));
    await saveNote();
    $("handoff-dialog").showModal();
  } catch (e) {
    toast(e.message);
  }
}
async function loadLibrary() {
  try {
    notes = (await storage.all()).sort((a, b) =>
      (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt),
    );
    renderLibrary();
  } catch {
    storageWarning();
  }
}
function renderLibrary() {
  const q = $("library-search").value.trim().toLowerCase(),
    category = $("library-category").value;
  const visible = notes.filter(
    (n) =>
      (!category || n.category === category) &&
      (!q ||
        [n.title, n.summary, n.context, ...n.tags]
          .join(" ")
          .toLowerCase()
          .includes(q)),
  );
  $("library-count").textContent = notes.length + " 条灵感";
  $("library-grid").replaceChildren();
  $("library-empty").hidden = visible.length > 0;
  $("library-empty").querySelector("h2").textContent = notes.length
    ? "换个关键词，再找找。"
    : "好想法，正在路上。";
  for (const n of visible) {
    const card = document.createElement("article");
    card.className = "card library-card";
    const button = document.createElement("button");
    button.className = "note-open";
    const tag = document.createElement("span");
    tag.className = "category";
    tag.textContent = n.category + (n.isDemo ? " · 演示" : "");
    const title = document.createElement("h2");
    title.textContent = n.title;
    const summary = document.createElement("p");
    summary.textContent = n.summary;
    button.append(tag, title, summary);
    button.onclick = async () => {
      state.note = structuredClone(n);
      delete state.note.images;
      state.images = structuredClone(n.images || []);
      state.context = n.context || "";
      $("context").value = state.context;
      renderImages();
      renderResult();
      showView("result");
      await persist().catch(storageWarning);
    };
    const footer = document.createElement("div");
    footer.className = "card-footer";
    const date = document.createElement("span");
    date.textContent = new Date(n.createdAt).toLocaleDateString("zh-CN");
    const del = document.createElement("button");
    del.className = "delete-note";
    del.textContent = "删除";
    del.setAttribute("aria-label", "删除 " + n.title);
    del.onclick = async () => {
      if (confirm("删除这条本地灵感？已存入苹果备忘录的内容不会受影响。")) {
        try {
          await storage.delete(n.id);
          await loadLibrary();
          toast("已删除本地记录");
        } catch {
          storageWarning();
        }
      }
    };
    footer.append(date, del);
    card.append(button, footer);
    $("library-grid").append(card);
  }
}
function renderSettings() {
  $("service-url").value = settings.serverUrl;
  $("shortcut-name").value = settings.shortcutName;
  $("access-token").value = token;
  $("remember-token").checked = Boolean(settings.rememberToken);
}
async function saveSettings(event) {
  event.preventDefault();
  fail("settings-error", "");
  try {
    const raw = $("service-url").value.trim();
    let url = "";
    if (raw) {
      const u = new URL(raw);
      if (
        u.protocol !== "https:" ||
        u.username ||
        u.password ||
        u.search ||
        u.hash ||
        (u.pathname !== "/" && u.pathname !== "")
      )
        throw new Error(
          "应用服务器地址请填写 HTTPS 网站域名，不要附加 /api/analyze、路径或密钥。",
        );
      url = u.origin;
    }
    const nextToken = $("access-token").value.trim();
    if (nextToken && nextToken.length < 16)
      throw new Error("应用访问口令至少 16 位，请与服务器配置保持一致。");
    settings = {
      serverUrl: url,
      shortcutName: $("shortcut-name").value.trim() || DEFAULT_SHORTCUT,
      rememberToken: $("remember-token").checked,
    };
    await storage.set("settings", settings);
    if (settings.rememberToken) await storage.set("access-token", nextToken);
    else await storage.remove("access-token");
    token = nextToken;
    toast("设置已保存，可以开始收集了");
  } catch (e) {
    fail("settings-error", e.message);
  }
}
async function exportBackup() {
  try {
    const all = await storage.all();
    download(
      JSON.stringify(
        {
          app: "shinian",
          version: 1,
          exportedAt: new Date().toISOString(),
          notes: all,
        },
        null,
        2,
      ),
      "拾念备份-" + new Date().toISOString().slice(0, 10) + ".json",
      "application/json",
    );
    toast("已生成备份，内含截图和笔记，请妥善保管");
  } catch {
    storageWarning();
  }
}
function download(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
async function importBackup(file) {
  if (!file) return;
  try {
    if (file.size > 50 * 1024 * 1024)
      throw new Error("备份超过 50 MB，请拆分后导入。");
    const data = JSON.parse(await file.text());
    if (
      data.app !== "shinian" ||
      data.version !== 1 ||
      !Array.isArray(data.notes) ||
      data.notes.length > 1000
    )
      throw new Error("这不是受支持的拾念备份。");
    const clean = data.notes.map((n) => {
      const base = normalizeResult({
        ...n,
        todos: Array.isArray(n.todos)
          ? n.todos.map((t) => (typeof t === "string" ? t : t.text))
          : n.todos,
      });
      if (
        typeof n.id !== "string" ||
        !n.id ||
        Number.isNaN(Date.parse(n.createdAt))
      )
        throw new Error("备份中的笔记格式不完整。");
      const images = Array.isArray(n.images) ? n.images : [];
      if (
        images.length > 6 ||
        images.some(
          (x) =>
            typeof x.name !== "string" ||
            !/^data:image\/(jpeg|png|webp);base64,/.test(x.thumbnail) ||
            !Array.isArray(x.slices) ||
            x.slices.length > 16 ||
            x.slices.some(
              (s) =>
                typeof s !== "string" ||
                !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(
                  s,
                ),
            ),
        )
      )
        throw new Error("备份中的图片格式无效。");
      return {
        ...base,
        id: crypto.randomUUID(),
        createdAt: n.createdAt,
        updatedAt: new Date().toISOString(),
        context: typeof n.context === "string" ? n.context.slice(0, 6000) : "",
        todos: base.todos.map((text, i) => ({
          text,
          done: Boolean(n.todos[i]?.done),
        })),
        images,
        isDemo: Boolean(n.isDemo),
      };
    });
    if (
      !confirm("将导入 " + clean.length + " 条灵感作为新记录，原有记录会保留。")
    )
      return;
    await storage.importNotes(clean);
    await loadLibrary();
    toast("已导入 " + clean.length + " 条灵感");
  } catch (e) {
    toast(e.message || "导入失败，原有数据已保留。");
  } finally {
    $("import-input").value = "";
  }
}
function newCapture() {
  if (busy) return;
  if (
    state.note &&
    !confirm("开始收集下一条？当前结果如需保留，请先保存到灵感库。")
  )
    return;
  state = { images: [], context: "", focus: "balanced", note: null };
  $("context").value = "";
  $("context-count").textContent = "0 / 6000";
  document.querySelectorAll(".focus-chip").forEach((b) => {
    const active = b.dataset.focus === "balanced";
    b.classList.toggle("selected", active);
    b.setAttribute("aria-pressed", String(active));
  });
  renderImages();
  fail("capture-error", "");
  showView("capture");
  void persist();
}
for (const c of CATEGORIES) {
  for (const id of ["note-category", "library-category"]) {
    const option = document.createElement("option");
    option.value = c;
    option.textContent = c;
    $(id).append(option);
  }
}
document
  .querySelectorAll(".nav-item")
  .forEach(
    (button) =>
      (button.onclick = () =>
        showView(
          button.dataset.view === "capture" && state.note
            ? "result"
            : button.dataset.view,
        )),
  );
$("image-input").onchange = (e) => void addFiles([...e.target.files]);
$("context").oninput = syncContext;
$("drop-zone").ondragover = (e) => {
  e.preventDefault();
  $("drop-zone").classList.add("dragover");
};
$("drop-zone").ondragleave = () => $("drop-zone").classList.remove("dragover");
$("drop-zone").ondrop = (e) => {
  e.preventDefault();
  $("drop-zone").classList.remove("dragover");
  void addFiles([...e.dataTransfer.files]);
};
document.querySelectorAll(".focus-chip").forEach(
  (button) =>
    (button.onclick = () => {
      state.focus = button.dataset.focus;
      document.querySelectorAll(".focus-chip").forEach((b) => {
        const active = b === button;
        b.classList.toggle("selected", active);
        b.setAttribute("aria-pressed", String(active));
      });
      schedulePersist();
    }),
);
$("analyze-button").onclick = () => void analyze();
$("cancel-button").onclick = () => controller?.abort("cancel");
$("demo-button").setAttribute("aria-label", "看看整理效果");
$("demo-button").onclick = () => {
  if (busy) return;
  if (
    state.note &&
    !confirm("打开演示会替换当前编辑中的结果。已保存的灵感不会改变，继续吗？")
  )
    return;
  state.note = {
    ...structuredClone(demo),
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    context: "",
  };
  renderResult();
  showView("result");
  void persist();
};
for (const id of [
  "note-title",
  "note-summary",
  "note-highlights",
  "note-insights",
  "note-tags",
])
  $(id).oninput = syncResult;
$("note-category").onchange = syncResult;
$("add-todo").onclick = () => {
  if (state.note.todos.length >= 12) {
    toast("最多保留 12 条行动");
    return;
  }
  state.note.todos.push({ text: "", done: false });
  renderTodos();
  $("todo-list").lastElementChild.querySelector("input[type=text]").focus();
  schedulePersist();
};
$("save-button").onclick = () => void saveNote();
$("notes-button").onclick = () => void handoff();
$("back-to-capture").onclick = () => showView("capture");
$("new-button").onclick = newCapture;
$("empty-capture").onclick = () => showView("capture");
$("copy-button").onclick = async () => {
  syncResult();
  try {
    await copyText(formatNote(state.note));
    toast("已复制完整笔记");
  } catch (e) {
    toast(e.message);
  }
};
$("share-button").onclick = async () => {
  syncResult();
  const text = formatNote(state.note);
  try {
    if (navigator.share)
      await navigator.share({ title: state.note.title, text });
    else {
      await copyText(text);
      toast("当前浏览器不支持系统分享，已复制文字。");
    }
  } catch (e) {
    if (e.name !== "AbortError") toast("分享未完成，请尝试复制文字。");
  }
};
$("open-shortcut").onclick = () => {
  $("handoff-dialog").close();
  location.href = buildShortcutUrl(settings.shortcutName);
  toast("已交给快捷指令，请在备忘录中确认结果");
};
$("close-handoff").onclick = () => $("handoff-dialog").close();
$("settings-form").onsubmit = saveSettings;
$("forget-token").onclick = async () => {
  token = "";
  settings.rememberToken = false;
  try {
    await storage.remove("access-token");
    await storage.set("settings", settings);
    renderSettings();
    toast("已清除设备上保存的口令");
  } catch {
    storageWarning();
  }
};
$("library-search").oninput = renderLibrary;
$("library-category").onchange = renderLibrary;
$("export-button").onclick = () => void exportBackup();
$("import-input").onchange = (e) => void importBackup(e.target.files[0]);
window.addEventListener("online", updateOffline);
window.addEventListener("offline", updateOffline);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") void persist();
});
window.addEventListener("pagehide", () => {
  void persist();
});
async function init() {
  document.querySelector("main").inert = true;
  document.querySelector(".bottom-nav").inert = true;
  try {
    const [savedSettings, savedToken, draft] = await Promise.all([
      storage.get("settings"),
      storage.get("access-token"),
      storage.get("draft"),
    ]);
    if (savedSettings) settings = { ...settings, ...savedSettings };
    token = savedToken || "";
    let recovered = draft;
    try {
      const j = JSON.parse(localStorage.getItem("shinian-draft-journal"));
      if (j && (!draft || j.modifiedAt >= draft.modifiedAt)) {
        recovered = {
          ...state,
          ...draft,
          ...j,
          images: (draft?.images || []).filter((x) =>
            j.imageIds.includes(x.id),
          ),
        };
        delete recovered.imageIds;
      }
    } catch {}
    if (recovered) {
      state = { ...state, ...recovered };
      $("context").value = state.context;
      $("context-count").textContent = state.context.length + " / 6000";
      document.querySelectorAll(".focus-chip").forEach((b) => {
        const active = b.dataset.focus === state.focus;
        b.classList.toggle("selected", active);
        b.setAttribute("aria-pressed", String(active));
      });
      renderImages();
      if (state.note) {
        renderResult();
        showView("result");
      }
    }
  } catch {
    storageWarning();
  }
  initialized = true;
  document.querySelector("main").inert = false;
  document.querySelector(".bottom-nav").inert = false;
  updateOffline();
  if ("serviceWorker" in navigator)
    navigator.serviceWorker
      .register("./sw.js")
      .catch(() => toast("离线功能未能启用，请保持联网使用。"));
}
void init();
