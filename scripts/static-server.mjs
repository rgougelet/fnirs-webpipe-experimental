import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8"
};

function safePath(rootDir, urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split("?")[0]);
  const raw = cleanPath === "/" ? "/index.html" : cleanPath;
  const resolved = path.normalize(path.join(rootDir, raw));
  if (!resolved.startsWith(path.normalize(rootDir))) {
    return null;
  }
  return resolved;
}

export function startStaticServer({ rootDir, host = "127.0.0.1", port = 4173 }) {
  const server = createServer(async (req, res) => {
    const target = safePath(rootDir, req.url || "/");
    if (!target) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    try {
      const body = await readFile(target);
      const ext = path.extname(target).toLowerCase();
      res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Surrogate-Control", "no-store");
      res.writeHead(200);
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("Not Found");
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve({ server, url: `http://${host}:${port}` });
    });
  });
}
