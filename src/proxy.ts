import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseEnv } from "@/lib/supabase/env";

const AUTH_PAGES = ["/login", "/signup"];

function redirectTo(request: NextRequest, pathname: string, next?: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  if (next) url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

/**
 * Runs before every matched request. It refreshes the Supabase session cookie
 * and keeps signed-out visitors out of /app. This is a convenience gate only:
 * the workspace layout and every Server Action check the user again, and
 * Row Level Security is what actually protects the data.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isWorkspace = pathname === "/app" || pathname.startsWith("/app/");
  const env = getSupabaseEnv();

  if (!env) {
    return isWorkspace ? redirectTo(request, "/login") : NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(env.url, env.publishableKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, cacheHeaders) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, { ...options, ...SESSION_COOKIE_OPTIONS });
        }
        for (const [key, value] of Object.entries(cacheHeaders ?? {})) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Verifies the session token and refreshes it when it is close to expiring.
  const { data } = await supabase.auth.getClaims();
  const isSignedIn = Boolean(data?.claims?.sub);

  const withSessionCookies = (redirect: NextResponse) => {
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  };

  if (isWorkspace && !isSignedIn) {
    return withSessionCookies(redirectTo(request, "/login", `${pathname}${search}`));
  }
  if (AUTH_PAGES.includes(pathname) && isSignedIn) {
    return withSessionCookies(redirectTo(request, "/app"));
  }
  return response;
}

export const config = {
  matcher: ["/app/:path*", "/login", "/signup", "/auth/:path*"],
};
