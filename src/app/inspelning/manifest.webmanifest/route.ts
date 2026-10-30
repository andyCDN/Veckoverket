import type { MetadataRoute } from "next";
import { appPath } from "@/lib/app-path";

export const dynamic = "force-static";

export function GET() {
  const manifest: MetadataRoute.Manifest = {
    id: appPath("/inspelning/"),
    name: "Samtalsinspelning",
    short_name: "Inspelning",
    description:
      "Spela in samtal, kategorisera efteråt och granska sammanfattningar.",
    lang: "sv",
    start_url: appPath("/inspelning/"),
    scope: appPath("/inspelning/"),
    display: "standalone",
    background_color: "#f1ead6",
    theme_color: "#f04b31",
    categories: ["productivity", "utilities"],
    prefer_related_applications: false,
    icons: [
      {
        src: appPath("/icons/inspelning-192.png"),
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: appPath("/icons/inspelning-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: appPath("/icons/inspelning-maskable-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
  return Response.json(manifest, {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8" },
  });
}
