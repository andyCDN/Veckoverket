import type { Metadata } from "next";
import { Workspace } from "@/components/workspace";
export const metadata: Metadata = {
  title: "Importera veckoschema – Veckoverket",
};
export default function Page() {
  return <Workspace initialScheduleImport />;
}
