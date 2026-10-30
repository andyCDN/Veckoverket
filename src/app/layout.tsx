import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { AppInstallProvider } from "@/components/app-install";
import { appPath } from "@/lib/app-path";
import "./globals.css";
import "./punk.css";
import "@fontsource/anton/latin-400.css";
import "./week-reference.css";
const masthead = localFont({
  src: "./fonts/RobotoCondensed-Masthead.woff",
  variable: "--font-masthead",
  weight: "700 900",
  display: "swap",
});
export const metadata: Metadata = {
  title: "Veckoverket – Veckoplanering",
  description: "Veckoplanering med aktiviteter, tidsmål och uppföljning.",
  applicationName: "Veckoverket",
  appleWebApp: {
    capable: true,
    title: "Veckoverket",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      {
        url: appPath("/icons/veckoverket-32.png"),
        sizes: "32x32",
        type: "image/png",
      },
      {
        url: appPath("/icons/veckoverket-192.png"),
        sizes: "192x192",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: appPath("/icons/veckoverket-180.png"),
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#243d9b",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sv">
      <body className={masthead.variable}>
        <AppInstallProvider>{children}</AppInstallProvider>
      </body>
    </html>
  );
}
