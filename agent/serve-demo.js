// Tiny combined server for the live demo:
//   GET /reasoning/0x<64-hex>.json  -> serves the agent's .reasoning-store/ payloads
//   GET /*                          -> serves the production frontend build (../frontend/dist)
// One process behind ONE tunnel serves the whole deployed demo, closing the gap called
// out in docs/DEPLOYMENT.md step 5 (option 1: simple static file server).
//
// Usage:  node serve-demo.js [port]            (default port 8787)
// Expose publicly:  cloudflared tunnel --url http://localhost:8787
import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_DIR = path.join(__dirname, ".reasoning-store");
const DIST_DIR = path.join(__dirname, "..", "frontend", "dist");
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 8787);

const REASONING_RE = /^\/reasoning\/(0x[0-9a-fA-F]{64})\.json$/;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

async function serveFile(res, file) {
  const body = await fs.readFile(file);
  res.writeHead(200, {
    "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(req.url ?? "/", "http://localhost");

  // Reasoning payloads: strictly <64-hex>.json inside the store dir — no traversal.
  const reasoning = REASONING_RE.exec(url.pathname);
  if (reasoning && req.method === "GET") {
    try {
      await serveFile(res, path.join(STORE_DIR, `${reasoning[1]}.json`));
    } catch {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "no reasoning payload for this decisionHash" }));
    }
    return;
  }

  // Static frontend build with index.html fallback (SPA-safe enough for this app).
  if (req.method === "GET") {
    try {
      const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const target = path.normalize(path.join(DIST_DIR, rel));
      if (target.startsWith(DIST_DIR)) {
        await serveFile(res, target);
        return;
      }
    } catch {
      // fall through to index.html
    }
    try {
      await serveFile(res, path.join(DIST_DIR, "index.html"));
      return;
    } catch {
      res.writeHead(500);
      res.end("frontend build missing — run `npm run build` in frontend/");
      return;
    }
  }

  res.writeHead(405);
  res.end();
});

server.listen(PORT, () => {
  console.log(`[serve-demo] reasoning: ${STORE_DIR}`);
  console.log(`[serve-demo] frontend : ${DIST_DIR}`);
  console.log(`[serve-demo] listening on http://localhost:${PORT}`);
});