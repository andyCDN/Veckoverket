import type { Metadata } from "next";
import { ScheduleImportPage } from "@/components/schedule-import-page";
export const metadata: Metadata = {
  title: "Importera veckoschema – Veckoverket",
};
export default function Page() {
  return <ScheduleImportPage />;
}
