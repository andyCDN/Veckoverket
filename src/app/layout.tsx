import type { Metadata } from "next";
import "@fontsource-variable/dm-sans/index.css";
import "@fontsource-variable/manrope/index.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "Veckoverket – Planera livet först",
  description:
    "En lugnare vecka med plats för arbete, kreativitet och livet däremellan.",
  applicationName: "Veckoverket",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
