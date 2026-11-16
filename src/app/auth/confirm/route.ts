import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import {
  failedConfirmPath,
  isRecoveryConfirmation,
  postConfirmPath,
} from "@/lib/auth/password-reset";
import { safeNextPath } from "@/lib/finance/validation";
import { clearRecoveryMarker, markRecoverySession } from "@/lib/supabase/recovery";
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
 * Landing point for the links Supabase emails: sign-up confirmation and
 * password recovery. Handles both link styles Supabase can send:
 *   ?token_hash=...&type=email|recovery   (custom email template, recommended)
 *   ?code=...                             (default template, PKCE code exchange)
 *
 * A link can be used once. An expired, invalid or already used link starts no
 * session; the visitor is sent back with an explanation.
 *
 * Where a verified visitor goes next is decided here, from the link's type and
 * the verified session. `next` is honoured only for paths inside /app.
 *
 * Every redirect is a path, not an absolute URL: the browser resolves it against
 * the address it really used. The session cookie set here therefore always
 * belongs to the same site the visitor lands on, whatever host name the server
 * itself reports (which can differ behind a proxy or when bound to 127.0.0.1).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const type = searchParams.get("type");
  const supabase = await createClient();

  if (supabase) {
    const tokenHash = searchParams.get("token_hash");
    const code = searchParams.get("code");

    let confirmed = false;
    let viaTokenHash = false;
    if (tokenHash && type && EMAIL_OTP_TYPES.includes(type as EmailOtpType)) {
      viaTokenHash = true;
      const { error } = await supabase.auth.verifyOtp({
        type: type as EmailOtpType,
        token_hash: tokenHash,
      });
      confirmed = !error;
    } else if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      confirmed = !error;
    }

    if (confirmed) {
      // A code link does not say what it was for; the session it started does.
      // The `type` in the URL counts only for a token that was verified as that type.
      const { data } = await supabase.auth.getClaims();
      const claims = data?.claims;
      const userId = claims?.sub;
      const sessionId = claims?.session_id;
      const isRecovery =
        isRecoveryConfirmation({ viaTokenHash, type, amr: claims?.amr }) &&
        typeof userId === "string" &&
        userId.length > 0 &&
        typeof sessionId === "string" &&
        sessionId.length > 0;

      // Only this branch can unlock /reset-password: it signs a proof for this
      // user and session. Any other verified link removes a proof left behind.
      // Without a signing secret no proof is made, and the reset page refuses.
      if (isRecovery) await markRecoverySession(userId, sessionId);
      else await clearRecoveryMarker();

      redirect(
        postConfirmPath({
          type: null,
          recoverySession: isRecovery,
          workspacePath: safeNextPath(searchParams.get("next")),
        }),
      );
    }

    // The link could not be verified: no proof may survive it.
    await clearRecoveryMarker();
  }

  redirect(`${failedConfirmPath(type)}?notice=link-invalid`);
}
