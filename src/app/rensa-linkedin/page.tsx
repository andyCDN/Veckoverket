import type { Metadata } from "next";
import { LinkedInRemovalPage } from "@/components/linkedin-removal-page";

export const metadata: Metadata = {
  title: "Radera LinkedIn-serien – Veckoverket",
};

export default function Page() {
  return <LinkedInRemovalPage />;
}
