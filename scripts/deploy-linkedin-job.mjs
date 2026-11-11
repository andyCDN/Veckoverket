import { spawn } from "node:child_process";
const functionName = process.env.LINKEDIN_JOB_FUNCTION || "quick-responder";
if (!["quick-responder", "linkedin-job"].includes(functionName))
  throw new Error("Ogiltigt funktionsnamn.");
const project = process.env.SUPABASE_PROJECT_REF || "cefzxeproambftvhcgme";
if (!process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
  console.error(
    "SUPABASE_ACCESS_TOKEN saknas. Lägg till den som hemlighet i molnmiljön, inte i chatten.",
  );
  process.exit(1);
}
if (!/^[a-z0-9]{20}$/.test(project))
  throw new Error("Ogiltigt Supabase-projekt.");
const child = spawn(
  "npx",
  [
    "--yes",
    "supabase",
    "functions",
    "deploy",
    functionName,
    "--project-ref",
    project,
    "--use-api",
  ],
  { stdio: "inherit", env: process.env },
);
child.on("error", () => {
  console.error("Supabase CLI kunde inte startas.");
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 1));
