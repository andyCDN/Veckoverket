// Validate before Next.js embeds public configuration in the browser bundle.
export function validateCloudConfig(
  url: string | undefined,
  key: string | undefined,
) {
  if (!url && !key) return;
  if (!url || !key)
    throw new Error(
      "Cloud storage needs both NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or the public ANON_KEY).",
    );
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("The Supabase project URL is invalid.");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  )
    throw new Error(
      "The Supabase URL must be an HTTP(S) project URL without credentials.",
    );
  if (key.startsWith("sb_secret_"))
    throw new Error(
      "A Supabase secret key cannot be used in the browser. Use the public publishable key.",
    );
  if (key.split(".").length === 3) {
    let role: unknown;
    try {
      role = JSON.parse(
        atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      ).role;
    } catch {
      throw new Error("The public Supabase key is invalid.");
    }
    if (role !== "anon")
      throw new Error(
        "Only the public anon key can be included in the browser. Use a publishable key or an anon key.",
      );
  } else if (!key.startsWith("sb_publishable_"))
    throw new Error(
      "Use a Supabase publishable key or the public anon JWT key.",
    );
}

export function validateGoogleClientId(clientId: string | undefined) {
  if (
    clientId &&
    !/^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)
  )
    throw new Error(
      "NEXT_PUBLIC_GOOGLE_CLIENT_ID must be a public Google OAuth web client ID, not a client secret.",
    );
}
