import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const project = process.env.SUPABASE_PROJECT_REF || "cefzxeproambftvhcgme";
if (!accessToken) {
  console.error(
    "SUPABASE_ACCESS_TOKEN saknas. Anslut den som hemlighet för molnmiljön; skriv inte värdet i chatten eller källkoden.",
  );
  process.exit(1);
}
if (!/^[a-z0-9]{20}$/.test(project))
  throw new Error("Ogiltigt Supabase-projekt.");
let workerToken = randomBytes(32).toString("hex");
const redact = (text) =>
  String(text)
    .replaceAll(accessToken, "[redacted]")
    .replaceAll(workerToken, "[redacted]");
// curl respects the managed environment's proxy and CA configuration. Headers
// travel through a private pipe, never command arguments or a saved config file.
async function http(url, authorization, body = "{}", seconds = 60) {
  if (/[\r\n]/.test(authorization))
    throw new Error("Inloggningsvärdet har ogiltigt format.");
  return new Promise((resolve, reject) => {
    const child = spawn(
      "curl",
      [
        "--silent",
        "--show-error",
        "--connect-timeout",
        "15",
        "--max-time",
        String(seconds),
        "--config",
        "/dev/fd/3",
        "--request",
        "POST",
        "--data-binary",
        "@-",
        "--write-out",
        "\n%{http_code}",
        url,
      ],
      { env: process.env, stdio: ["pipe", "pipe", "pipe", "pipe"] },
    );
    let output = "",
      error = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (error += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0)
        return reject(
          new Error(redact(error || "Serveranslutningen misslyckades.")),
        );
      const split = output.lastIndexOf("\n"),
        status = Number(output.slice(split + 1));
      resolve({
        ok: status >= 200 && status < 300,
        status,
        json: () => {
          try {
            return JSON.parse(output.slice(0, split) || "null");
          } catch {
            throw new Error("Serverns svar kunde inte läsas.");
          }
        },
      });
    });
    child.stdin.on("error", reject);
    child.stdio[3].on("error", reject);
    child.stdio[3].end(
      `header = ${JSON.stringify(`Authorization: Bearer ${authorization}`)}\nheader = "Content-Type: application/json"\n`,
    );
    child.stdin.end(body);
  });
}
async function query(sql, label) {
  const response = await http(
    `https://api.supabase.com/v1/projects/${project}/database/query`,
    accessToken,
    JSON.stringify({ query: sql }),
  );
  if (!response.ok)
    throw new Error(
      `${label} misslyckades (HTTP ${response.status}). Inga serverhemligheter skrivs ut.`,
    );
  if (label) console.log(label);
  return response.json();
}
async function cli(args) {
  await new Promise((resolve, reject) => {
    const child = spawn("npx", ["--yes", "supabase", ...args], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        console.log(redact(output.trim()));
        resolve();
      } else reject(new Error(redact(output)));
    });
  });
}
const directory = await mkdtemp(
  join(tmpdir(), "veckoverket-recording-deploy-"),
);
try {
  const available = await query(
    "select to_regclass('vault.decrypted_secrets') is not null as present",
    "Kökonfigurationen är kontrollerad.",
  );
  if (available?.[0]?.present) {
    const known = await query(
      "select decrypted_secret from vault.decrypted_secrets where name='veckoverket_recording_worker_token'",
      "",
    );
    if (
      typeof known?.[0]?.decrypted_secret === "string" &&
      /^[A-Za-z0-9_-]{32,256}$/.test(known[0].decrypted_secret)
    )
      workerToken = known[0].decrypted_secret;
  }
  const base = await readFile(
    new URL(
      "../supabase/migrations/202610300001_recordings.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const migration = await readFile(
    new URL(
      "../supabase/migrations/202610310001_recording_processing.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await query(
    base + "\n" + migration,
    "Inspelningens tabeller och versionshistorik är installerade.",
  );
  const secrets = join(directory, "worker.env");
  await writeFile(secrets, `RECORDING_WORKER_TOKEN=${workerToken}\n`, {
    mode: 0o600,
  });
  await cli([
    "secrets",
    "set",
    "--project-ref",
    project,
    "--env-file",
    secrets,
  ]);
  await cli([
    "functions",
    "deploy",
    "recording-worker",
    "--project-ref",
    project,
    "--use-api",
  ]);
  await cli([
    "functions",
    "deploy",
    "recording",
    "--project-ref",
    project,
    "--use-api",
  ]);
  const scheduler = (
    await readFile(
      new URL("../supabase/recording-scheduler.sql", import.meta.url),
      "utf8",
    )
  )
    .replaceAll("__WORKER_TOKEN__", workerToken)
    .replaceAll("__PROJECT_URL__", `https://${project}.supabase.co`);
  await query(
    scheduler,
    "Serverkön är schemalagd och kan fortsätta utan en öppen webbsida.",
  );
  await query(
    "select public.dispatch_recording_worker();",
    "Bearbetningen är startad.",
  );
  const verified = await http(
    `https://${project}.supabase.co/functions/v1/recording-worker`,
    workerToken,
    "{}",
    120,
  );
  if (!verified.ok)
    throw new Error(
      `Arbetarens anslutningskontroll misslyckades (HTTP ${verified.status}). Kön och ljudet är bevarade.`,
    );
  console.log("Arbetarens anslutning är verifierad.");
} catch (error) {
  console.error(
    redact(
      error instanceof Error
        ? error.message
        : "Publiceringen kunde inte slutföras.",
    ),
  );
  process.exitCode = 1;
} finally {
  await rm(directory, { recursive: true, force: true });
}
