import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { preparePdfReader } from "./prepare-pdf-reader.mjs";

await preparePdfReader();
const require = createRequire(import.meta.url);
const child = spawn(
  process.execPath,
  [require.resolve("next/dist/bin/next"), ...process.argv.slice(2)],
  { stdio: "inherit" },
);
child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
