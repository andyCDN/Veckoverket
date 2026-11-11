import { createClient } from "@supabase/supabase-js";
import { linkedInJobHandler } from "../_shared/linkedin-job-handler.ts";
const client = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
Deno.serve(
  linkedInJobHandler({
    origin: Deno.env.get("APP_ORIGIN") || "https://andycdn.github.io",
    async authenticate(token) {
      if (!token) return null;
      const { data, error } = await client.auth.getUser(token);
      return !error && data.user && !data.user.is_anonymous
        ? data.user.id
        : null;
    },
  }),
);
