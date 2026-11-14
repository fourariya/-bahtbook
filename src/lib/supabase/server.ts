import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { SESSION_COOKIE_OPTIONS } from "./cookie-options";
import type { Database } from "./database.types";
import { getSupabaseEnv } from "./env";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * It acts as the signed-in user (publishable key + the user's session cookie),
 * so every query is subject to Row Level Security.
 *
 * Returns null when Supabase has not been configured.
 */
export async function createClient() {
  const env = getSupabaseEnv();
  if (!env) return null;

  const cookieStore = await cookies();

  return createServerClient<Database>(env.url, env.publishableKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, { ...options, ...SESSION_COOKIE_OPTIONS });
          }
        } catch {
          // Server Components cannot write cookies. The proxy (src/proxy.ts)
          // refreshes the session on every request, so this is safe to ignore.
        }
      },
    },
  });
}

export type ServerSupabaseClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;
