import test from "node:test";
import assert from "node:assert/strict";
import { analyzeRequest, buildProviderRequest } from "../server/analyze.js";
const image = "data:image/png;base64,aGVsbG8=";
const input = { images: [image], context: "可做什么？", focus: "actions" };
const config = {
  apiKey: "test-provider-secret",
  baseUrl: "https://provider.example/v1",
  model: "vision-model",
  protocol: "chat",
  accessToken: "this-is-a-test-access-token",
  allowedOrigins: ["https://my-app.example"],
};
const output = {
  title: "测试主题",
  category: "学习与研究",
  summary: "这是摘要。",
  highlights: ["原文要点"],
  todos: ["确认来源"],
  insights: ["可作延伸"],
  tags: ["学习"],
  uncertainty: "",
};
const request = (body = input, headers = {}) =>
  new Request("https://my-app.example/api/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://my-app.example",
      Authorization: "Bearer " + config.accessToken,
      ...headers,
    },
    body: JSON.stringify(body),
  });
test("unauthorized or untrusted origin never calls provider", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    throw new Error("should not run");
  };
  assert.equal(
    (
      await analyzeRequest(
        request(input, { Authorization: "Bearer wrong" }),
        config,
        fetcher,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await analyzeRequest(
        request(input, { Origin: "https://evil.example" }),
        config,
        fetcher,
      )
    ).status,
    403,
  );
  assert.equal(calls, 0);
});
test("missing server credentials is actionable and never leaks config", async () => {
  const r = await analyzeRequest(request(), { ...config, apiKey: "" });
  assert.equal(r.status, 503);
  assert.doesNotMatch(await r.text(), /test-provider-secret/);
});
test("chat and responses payloads include all images and context", () => {
  const c = buildProviderRequest(input, config);
  assert.equal(c.url, "https://provider.example/v1/chat/completions");
  assert.equal(c.body.messages[1].content[1].image_url.url, image);
  assert.match(c.body.messages[1].content[0].text, /可做什么/);
  const r = buildProviderRequest(input, { ...config, protocol: "responses" });
  assert.equal(r.body.input[0].content[1].image_url, image);
  assert.equal(r.body.store, false);
});
test("successful chat result returns validated data with no secrets", async () => {
  let body;
  const fetcher = async (url, init) => {
    body = JSON.parse(init.body);
    assert.equal(init.headers.Authorization, "Bearer test-provider-secret");
    return Response.json({
      choices: [
        { finish_reason: "stop", message: { content: JSON.stringify(output) } },
      ],
    });
  };
  const r = await analyzeRequest(request(), config, fetcher);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).result.title, "测试主题");
  assert.equal(body.model, "vision-model");
  assert.equal(r.headers.get("Cache-Control"), "no-store");
});
test("malformed, truncated and refusal responses are errors, not valid notes", async () => {
  for (const data of [
    { choices: [{ message: { content: "not json" } }] },
    {
      choices: [
        {
          finish_reason: "length",
          message: { content: JSON.stringify(output) },
        },
      ],
    },
    { choices: [{ message: { refusal: "no" } }] },
  ]) {
    const r = await analyzeRequest(request(), config, async () =>
      Response.json(data),
    );
    assert.equal(r.status, 502);
  }
});
test("upstream error does not echo secrets or private response content", async () => {
  const r = await analyzeRequest(request(), config, async () =>
    Response.json(
      { error: { message: "secret test-provider-secret private text" } },
      { status: 401 },
    ),
  );
  assert.equal(r.status, 502);
  const text = await r.text();
  assert.doesNotMatch(text, /test-provider-secret|private text/);
});
test("rejects oversized content before calling provider", async () => {
  let called = false;
  const r = await analyzeRequest(
    request({ ...input, context: "x".repeat(6001) }),
    config,
    async () => {
      called = true;
    },
  );
  assert.equal(r.status, 400);
  assert.equal(called, false);
});
test("responses API result is validated and refusal is not treated as a note", async () => {
  const cfg = {
    ...config,
    protocol: "responses",
    accessToken: "responses-specific-test-access-token",
  };
  const req = () =>
    request(input, { Authorization: "Bearer " + cfg.accessToken });
  const r = await analyzeRequest(req(), cfg, async () =>
    Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(output) }],
        },
      ],
    }),
  );
  assert.equal(r.status, 200);
  assert.equal((await r.json()).result.title, "测试主题");
  const refused = await analyzeRequest(req(), cfg, async () =>
    Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          content: [{ type: "refusal", refusal: "Cannot read" }],
        },
      ],
    }),
  );
  assert.equal(refused.status, 502);
});
test("allowed cross-origin preflight is explicit and never includes a wildcard", async () => {
  const cfg = { ...config, allowedOrigins: ["https://example.github.io"] };
  const r = await analyzeRequest(
    new Request("https://service.example/api/analyze", {
      method: "OPTIONS",
      headers: { Origin: "https://example.github.io" },
    }),
    cfg,
  );
  assert.equal(r.status, 204);
  assert.equal(
    r.headers.get("Access-Control-Allow-Origin"),
    "https://example.github.io",
  );
});
