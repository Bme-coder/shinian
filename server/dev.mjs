import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { analyzeRequest, configFromEnv } from "./analyze.js";
const root = fileURLToPath(new URL("../public/", import.meta.url));
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".shortcut": "application/octet-stream",
};
export function makeServer() {
  return http.createServer(async (req, res) => {
    try {
      const origin = "http://" + (req.headers.host || "localhost");
      const url = new URL(req.url, origin);
      if (url.pathname === "/api/analyze") {
        const controller = new AbortController();
        req.on("aborted", () => controller.abort());
        const request = new Request(url, {
          method: req.method,
          headers: req.headers,
          body: ["GET", "HEAD"].includes(req.method)
            ? undefined
            : Readable.toWeb(req),
          duplex: "half",
          signal: controller.signal,
        });
        const response = await analyzeRequest(request, configFromEnv());
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(await response.text());
        return;
      }
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405);
        res.end();
        return;
      }
      const name = decodeURIComponent(url.pathname);
      const path = resolve(
        root,
        "." + (name.endsWith("/") ? name + "index.html" : name),
      );
      if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const data = await readFile(path);
      res.writeHead(200, {
        "Content-Type": mime[extname(path)] || "application/octet-stream",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self' https:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch (e) {
      res.writeHead(e.code === "ENOENT" ? 404 : 400, {
        "Content-Type": "text/plain; charset=utf-8",
      });
      res.end("页面不存在或请求无效");
    }
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.PORT || 8787);
  makeServer().listen(port, process.env.HOST || "127.0.0.1", () =>
    console.log("拾念已启动：http://127.0.0.1:" + port),
  );
}
