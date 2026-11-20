import type { Metadata } from "next";
import { PersonalSchedulePage } from "@/components/personal-schedule-page";

export const metadata: Metadata = { title: "Ditt veckoschema – Veckoverket" };

export default function Page() {
  return <PersonalSchedulePage />;
}
