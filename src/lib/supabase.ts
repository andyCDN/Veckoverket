import { createClient } from "@supabase/supabase-js";
import { decodeData } from "./storage";
import type { AppData } from "./types";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key) : null;
export async function loadCloud(userId: string): Promise<AppData | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("workspaces")
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? decodeData(JSON.stringify(data.data)) : null;
}
export async function saveCloud(userId: string, data: AppData) {
  if (!supabase) throw new Error("Supabase är inte konfigurerat.");
  const { error } = await supabase
    .from("workspaces")
    .upsert({ user_id: userId, data, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
