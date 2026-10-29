import type { NextConfig } from "next";
import {
  validateCloudConfig,
  validateGoogleClientId,
} from "./src/lib/cloud-config";
validateCloudConfig(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

validateGoogleClientId(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

// GitHub Pages serves a static export; local development keeps its normal server.
// configure-pages supplies the base path (empty for a custom domain/user site).
const pages = process.env.GITHUB_PAGES === "true";
const basePath = process.env.PAGES_BASE_PATH ?? "/Veckoverket";
const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  ...(pages ? { output: "export", basePath, trailingSlash: true } : {}),
};
export default config;
