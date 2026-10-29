import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

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
process.exit(result.status ?? 1);
