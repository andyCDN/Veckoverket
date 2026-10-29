import type { Metadata } from "next";
import "@fontsource/anton/latin-400.css";
import "./globals.css";
import "./punk.css";
export const metadata: Metadata = {
  title: "Veckoverket – Veckoplanering",
  description: "Veckoplanering med aktiviteter, tidsmål och uppföljning.",
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
