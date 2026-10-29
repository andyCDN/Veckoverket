import { createClient } from "@supabase/supabase-js";
import { decodeData } from "./storage";
import type { AppData } from "./types";
import type { CloudDocument, CloudTransport } from "./workspace-sync";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key) : null;

export class CloudConflict extends Error {
  constructor() {
    super("Molnplanen har ändrats på en annan enhet.");
    this.name = "CloudConflict";
  }
}
function document(row: {
  data: unknown;
  revision: number;
  updated_at: string;
}): CloudDocument {
  if (!Number.isSafeInteger(row.revision) || row.revision < 1)
    throw new Error(
      "Molnlagringens databas behöver uppdateras. Se installationsinstruktionerna.",
    );
  return {
    data: decodeData(JSON.stringify(row.data)),
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}
export function cloudTransport(userId: string): CloudTransport {
  const client = supabase;
  if (!client) throw new Error("Molnlagring är inte ansluten.");
  return {
    async load() {
      const { data, error } = await client
        .from("workspaces")
        .select("data,revision,updated_at")
        .eq("user_id", userId)
        .retry(false)
        .abortSignal(AbortSignal.timeout(15000))
        .maybeSingle();
      if (error)
        throw new Error(
          "Molnplanen kunde inte hämtas. Kontrollera anslutningen och databasinstallationen.",
        );
      return data ? document(data) : null;
    },
    async save(data: AppData, expectedRevision: number) {
      const { data: result, error } = await client
        .rpc("save_workspace", {
          workspace_user_id: userId,
          workspace_data: data,
          expected_revision: expectedRevision,
        })
        .abortSignal(AbortSignal.timeout(15000))
        .single();
      if (error?.code === "40001") throw new CloudConflict();
      if (error)
        throw new Error(
          "Molnplanen kunde inte sparas. Ändringarna väntar på att skickas. Kontrollera anslutningen och databasinstallationen.",
        );
      return document(
        result as { data: unknown; revision: number; updated_at: string },
      );
    },
  };
}
