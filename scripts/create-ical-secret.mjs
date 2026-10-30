import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";

try {
  await writeFile(
    ".env.ical-server",
    `ICAL_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}\n`,
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    "Created .env.ical-server. Upload it with: npx supabase secrets set --env-file .env.ical-server",
  );
} catch (error) {
  if (error.code === "EEXIST") {
    console.error(
      ".env.ical-server already exists. Keep the existing encryption key; it was not overwritten.",
    );
  } else
    console.error(
      "Could not create .env.ical-server. Check directory permissions.",
    );
  process.exitCode = 1;
}
