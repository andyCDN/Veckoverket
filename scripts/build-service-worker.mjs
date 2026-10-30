import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export async function buildServiceWorker(basePath = "/Veckoverket") {
  const root = fileURLToPath(new URL("../out/", import.meta.url));
  const template = await readFile(
    new URL("./service-worker.template.js", import.meta.url),
    "utf8",
  );
  async function files(directory) {
    const result = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) result.push(...(await files(path)));
      else if (/\.(js|css|woff2?|png|svg)$/.test(entry.name)) result.push(path);
    }
    return result;
  }
  const paths = [
    join(root, "index.html"),
    join(root, "inspelning", "index.html"),
    join(root, "pcm-capture.worklet.js"),
    join(root, "manifest.webmanifest"),
    join(root, "inspelning", "manifest.webmanifest"),
    ...(await files(join(root, "_next", "static"))),
    ...(await files(join(root, "icons"))),
  ].sort();
  const hash = createHash("sha256").update(template);
  const scope = `${basePath}/`;
  const assets = [];
  for (const path of paths) {
    const name = relative(root, path).replaceAll("\\", "/");
    hash.update(name).update(await readFile(path));
    assets.push(
      name === "index.html"
        ? scope
        : name.endsWith("/index.html")
          ? `${scope}${encodeURI(name.slice(0, -10))}`
          : `${scope}${encodeURI(name)}`,
    );
  }
  const config = {
    scope,
    pages: [scope, `${scope}inspelning/`],
    cachePrefix: `veckoverket-pwa-${encodeURIComponent(scope)}-`,
    version: hash.digest("hex").slice(0, 20),
    assets,
  };
  const source = template.replace(
    '"__PWA_CONFIG_JSON__"',
    JSON.stringify(JSON.stringify(config)),
  );
  await writeFile(join(root, "sw.js"), source);
  console.log(
    `PWA: exported service worker with ${assets.length} public files for ${scope}`,
  );
}
