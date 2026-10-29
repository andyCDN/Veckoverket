// A local preview of the exported site at exactly its deployed base path.
// This is a development helper, not a production application server.
import { createServer } from "node:http";
import { open, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../out/", import.meta.url));
const basePath = process.env.PAGES_BASE_PATH ?? "/Veckoverket";
const port = Number(process.env.PAGES_PREVIEW_PORT ?? 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

await stat(resolve(root, "index.html"));
createServer(async (request, response) => {
  let file;
  try {
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    const pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    if (basePath && pathname === basePath) {
      response.writeHead(308, { Location: `${basePath}/` }).end();
      return;
    }
    if (!pathname.startsWith(`${basePath}/`)) {
      response.writeHead(404).end("Not found");
      return;
    }
    const relative = pathname.slice(basePath.length + 1);
    const path = resolve(root, relative || "index.html");
    if (!path.startsWith(root.endsWith(sep) ? root : `${root}${sep}`)) {
      response.writeHead(404).end("Not found");
      return;
    }
    const info = await stat(path);
    const filename = info.isDirectory() ? resolve(path, "index.html") : path;
    file = await open(filename);
    response.writeHead(200, {
      "Content-Type": types[extname(filename)] ?? "application/octet-stream",
      ...(relative === "sw.js" ? { "Cache-Control": "no-cache" } : {}),
    });
    if (request.method === "HEAD") {
      await file.close();
      response.end();
    } else {
      file.createReadStream().pipe(response);
    }
  } catch {
    await file?.close().catch(() => {});
    response.writeHead(404).end("Not found");
  }
}).listen(port, () =>
  console.log(`Pages preview: http://localhost:${port}${basePath}/`),
);
