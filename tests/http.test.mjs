import test from "node:test";
import assert from "node:assert/strict";
import { makeServer } from "../server/dev.mjs";
test("static server exposes only public assets and protects API", async () => {
  const server = makeServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const home = await fetch(base);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /拾念/);
    assert.match(
      home.headers.get("Content-Security-Policy"),
      /frame-ancestors 'none'/,
    );
    for (const path of [
      "/.env",
      "/server/analyze.js",
      "/package.json",
      "/%2e%2e%2fpackage.json",
    ]) {
      const r = await fetch(base + path);
      assert.notEqual(r.status, 200);
    }
    for (const path of [
      "/icons/icon-192.png",
      "/manifest.webmanifest",
      "/guide.html",
      "/sw.js",
    ])
      assert.equal((await fetch(base + path)).status, 200);
    assert.ok(
      [401, 503].includes(
        (
          await fetch(base + "/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          })
        ).status,
      ),
    );
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
