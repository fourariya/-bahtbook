export interface SupabaseEnv {
  url: string;
  publishableKey: string;
}

function looksPrivileged(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  // Legacy keys are JWTs. Refuse one whose role claim is service_role.
  const payload = key.split(".")[1];
  if (!payload) return false;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      role?: unknown;
    };
    return claims.role === "service_role";
  } catch {
    return false;
  }
}

/**
 * Reads the Supabase connection settings, or returns null when the project has
 * not been configured yet. The application only ever uses the publishable
 * (anon) key together with the signed-in user's session, so Row Level Security
 * always applies. A service-role or secret key is rejected outright.
 */
export function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.SUPABASE_URL?.trim();
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("SUPABASE_URL is not a valid URL.");
  }
  const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !isLocal) {
    throw new Error("SUPABASE_URL must use https.");
  }
  if (looksPrivileged(publishableKey)) {
    throw new Error(
      "SUPABASE_PUBLISHABLE_KEY holds a secret or service-role key. Use the publishable (anon) key instead.",
    );
  }
  return { url, publishableKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseEnv() !== null;
}
