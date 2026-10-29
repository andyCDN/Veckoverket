import type { NextConfig } from "next";

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
