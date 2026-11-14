import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/finance/validation";
import { createClient } from "@/lib/supabase/server";

const EMAIL_OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "email",
  "magiclink",
  "recovery",
  "invite",
  "email_change",
];

/**
 * Landing point for the confirmation link in the sign-up email.
 * Handles both link styles Supabase can send:
 *   ?token_hash=...&type=email   (custom email template, recommended)
 *   ?code=...                    (default template, PKCE code exchange)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const destination = request.nextUrl.clone();
  destination.search = "";

  const supabase = await createClient();
  if (supabase) {
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type") as EmailOtpType | null;
    const code = searchParams.get("code");

    let confirmed = false;
    if (tokenHash && type && EMAIL_OTP_TYPES.includes(type)) {
      const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
      confirmed = !error;
    } else if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      confirmed = !error;
    }

    if (confirmed) {
      const next = safeNextPath(searchParams.get("next"));
      const [pathname, query = ""] = next.split("?");
      destination.pathname = pathname;
      destination.search = query;
      return NextResponse.redirect(destination);
    }
  }

  destination.pathname = "/login";
  destination.searchParams.set("notice", "link-invalid");
  return NextResponse.redirect(destination);
}
