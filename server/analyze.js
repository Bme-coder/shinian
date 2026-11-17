import { timingSafeEqual, createHash } from "node:crypto";
import {
  buildProviderRequest,
  parseProviderResponse,
} from "../public/lib/provider.js";
export { buildProviderRequest } from "../public/lib/provider.js";
import {
  normalizeBaseUrl,
  validateSubmission,
  normalizeResult,
  MAX_BODY_BYTES,
  CATEGORIES,
} from "../public/lib/domain.js";
export function configFromEnv(env = process.env) {
  return {
    apiKey: env.AI_API_KEY || "",
    baseUrl: env.AI_BASE_URL || "https://api.openai.com/v1",
    model: env.AI_MODEL || "",
    protocol: env.AI_PROTOCOL || "chat",
    accessToken: env.APP_ACCESS_TOKEN || "",
    allowedOrigins: (env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    jsonMode: env.AI_JSON_MODE !== "false",
  };
}
const counters = new Map();
function admitted(token) {
  const now = Date.now(),
    key = createHash("sha256").update(token).digest("hex");
  const v = counters.get(key);
  if (!v || now - v.start > 60000) {
    counters.set(key, { start: now, count: 1 });
    return true;
  }
  if (v.count >= 6) return false;
  v.count++;
  return true;
}
export async function readLimited(stream, maxBytes) {
  if (!stream) return "";
  const reader = stream.getReader(),
    decoder = new TextDecoder();
  let total = 0,
    text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error("TOO_LARGE");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}
function authorized(header, token) {
  if (!token || token.length < 16) return false;
  return timingSafeEqual(
    createHash("sha256")
      .update(header || "")
      .digest(),
    createHash("sha256")
      .update("Bearer " + token)
      .digest(),
  );
}
export async function analyzeRequest(
  request,
  config = configFromEnv(),
  fetchImpl = fetch,
) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff",
  };
  const origin = request.headers.get("Origin");
  const sameOrigin = new URL(request.url).origin;
  const allowed =
    !origin || origin === sameOrigin || config.allowedOrigins?.includes(origin);
  const reply = (status, data) => Response.json(data, { status, headers });
  if (!allowed)
    return reply(403, {
      error: "这个应用地址未获得服务器授权，请配置 ALLOWED_ORIGINS。",
    });
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  }
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (request.method !== "POST")
    return reply(405, { error: "只接受 POST 请求。" });
  if (!config.accessToken || config.accessToken.length < 16)
    return reply(503, {
      error: "服务器尚未设置应用访问口令 APP_ACCESS_TOKEN（至少16位）。",
    });
  if (!authorized(request.headers.get("Authorization"), config.accessToken))
    return reply(401, { error: "应用访问口令不正确，请到设置中重新填写。" });
  if (!config.apiKey || !config.model)
    return reply(503, {
      error:
        "服务器尚未配置 AI_API_KEY 和 AI_MODEL。可先查看演示，配置后再整理真实截图。",
    });
  if (!["chat", "responses"].includes(config.protocol))
    return reply(503, { error: "服务器 AI_PROTOCOL 配置无效。" });
  if (
    !(request.headers.get("Content-Type") || "").startsWith("application/json")
  )
    return reply(415, { error: "需要 JSON 请求。" });
  if (Number(request.headers.get("Content-Length")) > MAX_BODY_BYTES)
    return reply(413, { error: "截图内容太大，请减少图片后重试。" });
  let input;
  try {
    input = validateSubmission(
      JSON.parse(await readLimited(request.body, MAX_BODY_BYTES)),
    );
  } catch (e) {
    return reply(e.message === "TOO_LARGE" ? 413 : 400, {
      error:
        e.message === "TOO_LARGE"
          ? "截图内容太大，请减少图片后重试。"
          : "输入格式不正确。请检查图片和补充说明（最多6000字）。",
    });
  }
  let provider;
  try {
    provider = buildProviderRequest(input, config);
  } catch {
    return reply(503, {
      error: "服务器 API 地址配置无效，需要 HTTPS 接口地址。",
    });
  }
  // Best-effort per-process protection; configure durable rate limits for shared deployments.
  if (!admitted(config.accessToken))
    return reply(429, { error: "整理请求较频繁，请一分钟后再试。" });
  try {
    const signal = AbortSignal.any([
      AbortSignal.timeout(90000),
      request.signal,
    ]);
    const upstream = await fetchImpl(provider.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + config.apiKey,
      },
      body: JSON.stringify(provider.body),
      signal,
      redirect: "error",
    });
    if (!upstream.ok) {
      await upstream.body?.cancel();
      return reply(upstream.status === 429 ? 429 : 502, {
        error:
          upstream.status === 429
            ? "AI 服务限流或额度不足，请稍后重试并检查额度。"
            : upstream.status === 401
              ? "AI 服务验证失败，请检查服务器上的 API 密钥。"
              : "AI 服务未能处理截图，请检查模型是否支持图片和所选接口协议。",
      });
    }
    const data = JSON.parse(await readLimited(upstream.body, 128 * 1024));
    const parsed = parseProviderResponse(data, config.protocol);
    const result = normalizeResult(parsed);
    return reply(200, { result });
  } catch (e) {
    return reply(e.name === "TimeoutError" ? 504 : 502, {
      error:
        e.name === "TimeoutError"
          ? "AI 整理超时，草稿已保留，请稍后重试。"
          : e.name === "AbortError"
            ? "整理已取消，草稿已保留。"
            : "AI 没有返回完整的可用内容，草稿已保留。请重试或换用支持图片和 JSON 输出的模型。",
    });
  }
}
