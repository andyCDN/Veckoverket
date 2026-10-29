import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { buildServiceWorker } from "./build-service-worker.mjs";

const require = createRequire(import.meta.url);
const result = spawnSync(
  process.execPath,
  [require.resolve("next/dist/bin/next"), "build"],
  {
    stdio: "inherit",
    env: { ...process.env, GITHUB_PAGES: "true" },
  },
);
if (result.error) {
  console.error(result.error.message);
}
if (result.status !== 0) process.exit(result.status ?? 1);
await buildServiceWorker(process.env.PAGES_BASE_PATH ?? "/Veckoverket");
