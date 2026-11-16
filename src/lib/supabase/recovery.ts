import "server-only";

import { cookies } from "next/headers";

import {
  RECOVERY_MARKER_COOKIE,
  RECOVERY_MARKER_PATH,
  RECOVERY_WINDOW_SECONDS,
  isRecoverySession,
  recoveryMarkerMatches,
} from "@/lib/auth/password-reset";

import { SESSION_COOKIE_OPTIONS } from "./cookie-options";
import type { ServerSupabaseClient } from "./server";

/**
 * True only when the request carries a session that is valid (confirmed with
 * the Auth server, not just read from the cookie), was started by an emailed
 * link within the recovery window, and is the very session that /auth/confirm
 * marked after verifying a recovery link. An ordinary logged-in session, or
 * one started by a magic link, an email code or a sign-up confirmation, is not
 * enough to set a new password here.
 */
export async function hasRecoverySession(supabase: ServerSupabaseClient): Promise<boolean> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return false;

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!isRecoverySession(claims?.amr, Math.floor(Date.now() / 1000))) return false;

  const marker = (await cookies()).get(RECOVERY_MARKER_COOKIE)?.value;
  return recoveryMarkerMatches(marker, claims?.session_id);
}

/** Records that this session was started by a verified recovery link. */
export async function markRecoverySession(sessionId: string): Promise<void> {
  (await cookies()).set(RECOVERY_MARKER_COOKIE, sessionId, {
    ...SESSION_COOKIE_OPTIONS,
    path: RECOVERY_MARKER_PATH,
    maxAge: RECOVERY_WINDOW_SECONDS,
  });
}

/** Removes the marker: after the password was changed, or when another kind of link is opened. */
export async function clearRecoveryMarker(): Promise<void> {
  (await cookies()).set(RECOVERY_MARKER_COOKIE, "", {
    ...SESSION_COOKIE_OPTIONS,
    path: RECOVERY_MARKER_PATH,
    maxAge: 0,
  });
}
