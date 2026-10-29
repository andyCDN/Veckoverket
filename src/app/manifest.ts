import type { MetadataRoute } from "next";
import { appPath } from "@/lib/app-path";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: appPath(),
    name: "Veckoverket",
    short_name: "Veckoverket",
    description: "Dagens aktiviteter, veckoplanering och uppföljning.",
    lang: "sv",
    start_url: appPath(),
    scope: appPath(),
    display: "standalone",
    background_color: "#f1ead6",
    theme_color: "#243d9b",
    categories: ["productivity", "lifestyle"],
    prefer_related_applications: false,
    icons: [
      {
        src: appPath("/icons/veckoverket-192.png"),
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: appPath("/icons/veckoverket-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: appPath("/icons/veckoverket-maskable-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
