import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const path = process.env.PAGES_BASE_PATH ?? "/Veckoverket";
const url = `http://localhost:4173${path}/`;
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: url },
  webServer: {
    command: "npm run preview:pages",
    url,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
