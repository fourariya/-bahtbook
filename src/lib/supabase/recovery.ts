import "server-only";

import { cookies } from "next/headers";

import {
  RECOVERY_MARKER_COOKIE,
  RECOVERY_MARKER_PATH,
  RECOVERY_WINDOW_SECONDS,
  isRecoverySession,
} from "@/lib/auth/password-reset";
import {
  createRecoveryProof,
  recoveryProofSecret,
  verifyRecoveryProof,
} from "@/lib/auth/recovery-proof";

import { SESSION_COOKIE_OPTIONS } from "./cookie-options";
import type { ServerSupabaseClient } from "./server";

const now = () => Math.floor(Date.now() / 1000);

/**
 * True only when the request carries a session that is valid (confirmed with
 * the Auth server, not just read from the cookie), was started by an emailed
 * link within the recovery window, and comes with a proof, signed by this
 * server, that /auth/confirm verified a recovery link for this very user and
 * session. An ordinary logged-in session, or one started by a magic link, an
 * email code or a sign-up confirmation, is not enough to set a new password
 * here, and neither is a cookie the visitor wrote themselves.
 */
export async function hasRecoverySession(supabase: ServerSupabaseClient): Promise<boolean> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return false;

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims || claims.sub !== user.id) return false;
  if (!isRecoverySession(claims.amr, now())) return false;

  const proof = (await cookies()).get(RECOVERY_MARKER_COOKIE)?.value;
  return verifyRecoveryProof(
    proof,
    { userId: user.id, sessionId: claims.session_id },
    now(),
    recoveryProofSecret(),
  );
}

/**
 * Records, in a signed cookie, that this session of this user was started by a
 * verified recovery link. Returns false, and records nothing, when the signing
 * secret is not configured.
 */
export async function markRecoverySession(userId: string, sessionId: string): Promise<boolean> {
  const secret = recoveryProofSecret();
  if (!secret) {
    await clearRecoveryMarker();
    // The name of the setting only. Never a value.
    console.error("[auth] RECOVERY_PROOF_SECRET is missing or too short; recovery is closed");
    return false;
  }
  (await cookies()).set(
    RECOVERY_MARKER_COOKIE,
    createRecoveryProof({ userId, sessionId }, now(), secret),
    { ...SESSION_COOKIE_OPTIONS, path: RECOVERY_MARKER_PATH, maxAge: RECOVERY_WINDOW_SECONDS },
  );
  return true;
}

/**
 * Removes the proof: after the password was changed, on logout, when a link
 * could not be verified, or when another kind of link is opened.
 */
export async function clearRecoveryMarker(): Promise<void> {
  (await cookies()).set(RECOVERY_MARKER_COOKIE, "", {
    ...SESSION_COOKIE_OPTIONS,
    path: RECOVERY_MARKER_PATH,
    maxAge: 0,
  });
}
