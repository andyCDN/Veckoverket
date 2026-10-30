import { createClient } from "@supabase/supabase-js";
import { icalHandler, type SavedFeed } from "../_shared/ical-handler.ts";

const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const handler = icalHandler({
  origin: Deno.env.get("APP_ORIGIN") || "https://andycdn.github.io",
  encryptionKey: Deno.env.get("ICAL_ENCRYPTION_KEY") || "",
  async authenticate(token) {
    const { data, error } = await client.auth.getUser(token);
    return !error && data.user && !data.user.is_anonymous ? data.user.id : null;
  },
  store: {
    async load(userId) {
      const { data, error } = await client
        .from("calendar_ical_feeds")
        .select("calendar_id,name,encrypted_url")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data?.encrypted_url ? (data as SavedFeed) : null;
    },
    async save(userId, feed) {
      const { error } = await client
        .from("calendar_ical_feeds")
        .upsert({
          user_id: userId,
          ...feed,
          updated_at: new Date().toISOString(),
        });
      if (error) throw error;
    },
    async remove(userId) {
      const { error } = await client
        .from("calendar_ical_feeds")
        .delete()
        .eq("user_id", userId);
      if (error) throw error;
    },
    async claim(userId) {
      const { data, error } = await client.rpc("claim_ical_fetch", {
        feed_user_id: userId,
      });
      if (error) throw error;
      return data === true;
    },
  },
});
Deno.serve(handler);
