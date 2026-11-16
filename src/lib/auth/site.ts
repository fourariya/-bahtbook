/**
 * Deployment settings read from the environment by the authentication code.
 * No framework dependencies, so the rules can be unit tested directly.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

/**
 * The public origin of this site, from SITE_URL, or null when that setting is
 * missing or is not a plain site address. Accepted: `https://host[:port]`, and
 * `http://` for localhost only. Rejected: anything with a path, a query, a
 * fragment or credentials, and any other scheme.
 *
 * This is the only source for addresses placed in emails. A request's Host or
 * X-Forwarded-Host header is never used: whoever sends the request controls it.
 */
export function trustedSiteUrl(raw: string | undefined = process.env.SITE_URL): string | null {
  const value = raw?.trim().replace(/\/+$/, "");
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const secure = url.protocol === "https:";
  const local = url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname);
  if (!secure && !local) return null;
  if (url.username || url.password) return null;
  if (url.pathname !== "/" || url.search || url.hash) return null;
  return url.origin;
}

/**
 * Where a link in a sign-up confirmation or password recovery email returns
 * to. Undefined when SITE_URL is not usable: Supabase then falls back to the
 * Site URL configured in the project, which is the safe default.
 */
export function confirmRedirectUrl(
  raw: string | undefined = process.env.SITE_URL,
): string | undefined {
  const origin = trustedSiteUrl(raw);
  return origin ? `${origin}/auth/confirm` : undefined;
}

/**
 * Whether the site offers registration. On unless SIGNUP_ENABLED is "false".
 * When off, no page links to the sign-up form, the form is not rendered and
 * the Server Action refuses. New-user sign-ups must also be turned off in the
 * Supabase project, which is what actually enforces it.
 */
export function isSignupEnabled(raw: string | undefined = process.env.SIGNUP_ENABLED): boolean {
  return raw?.trim().toLowerCase() !== "false";
}

/** Shown wherever registration would have been offered while it is closed. */
export const SIGNUP_CLOSED_MESSAGE = "ขณะนี้ยังไม่เปิดรับสมัครสมาชิกใหม่";
