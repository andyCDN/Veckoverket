import type { Metadata, Viewport } from "next";
import { RecorderPage } from "@/components/recorder-page";
import { appPath } from "@/lib/app-path";

export const metadata: Metadata = {
  title: "Samtalsinspelning – Veckoverket",
  description: "Spela in samtal och kategorisera dem efteråt.",
  applicationName: "Samtalsinspelning",
  manifest: appPath("/inspelning/manifest.webmanifest"),
  appleWebApp: {
    capable: true,
    title: "Inspelning",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      {
        url: appPath("/icons/inspelning-32.png"),
        sizes: "32x32",
        type: "image/png",
      },
      {
        url: appPath("/icons/inspelning-192.png"),
        sizes: "192x192",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: appPath("/icons/inspelning-180.png"),
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};
export const viewport: Viewport = { themeColor: "#f04b31" };

export default function Page() {
  return <RecorderPage />;
}
