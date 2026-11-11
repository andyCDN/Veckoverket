import { defineConfig } from "@playwright/test";
import base from "./playwright.pages.config";
export default defineConfig({
  ...base,
  testDir: "./e2e-linkedin",
  webServer: {
    command: "npm run build:pages && npm run preview:pages",
    url: "http://localhost:4173/Veckoverket/",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_LINKEDIN_JOB_ENDPOINT:
        "http://localhost:4173/functions/v1/linkedin-job",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    },
  },
});
