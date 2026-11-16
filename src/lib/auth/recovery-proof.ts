import { createHmac, timingSafeEqual } from "node:crypto";

import { RECOVERY_WINDOW_SECONDS } from "./password-reset";

/**
 * A signed, short-lived proof that /auth/confirm verified a password recovery
 * link for one particular user and session. It is kept in an httpOnly cookie.
 *
 * A cookie can be replaced by whoever controls the browser, so its presence
 * proves nothing. What counts is the signature: an HMAC-SHA256, made with a
 * secret only the server holds, over the purpose, the user id, the session id
 * and the expiry. Change any of them and the signature no longer matches.
 *
 * The cookie value is `v1.<expiry in seconds>.<signature>`. It holds no user
 * id, session id or token.
 *
 * Server only: this file reads a secret and must never be imported by a
 * client component.
 */

const VERSION = "v1";
const PURPOSE = "bahtbook:password-recovery";

/** The shortest secret accepted. 32 characters of a random value. */
export const RECOVERY_PROOF_SECRET_MIN = 32;

/**
 * The signing secret, or null when it is missing or too short. Without it no
 * proof can be made or accepted, so password recovery stays closed.
 */
export function recoveryProofSecret(): string | null {
  const secret = process.env.RECOVERY_PROOF_SECRET?.trim();
  return secret && secret.length >= RECOVERY_PROOF_SECRET_MIN ? secret : null;
}

interface ProofSubject {
  userId: string;
  sessionId: string;
}

function sign(secret: string, subject: ProofSubject, expiresAt: number): Buffer {
  // Lengths are included so no two different (user, session) pairs share a message.
  const message = [
    PURPOSE,
    VERSION,
    subject.userId.length,
    subject.userId,
    subject.sessionId.length,
    subject.sessionId,
    expiresAt,
  ].join("\n");
  return createHmac("sha256", secret).update(message, "utf8").digest();
}

/** Makes a proof for this user and session, valid for the recovery window. */
export function createRecoveryProof(
  subject: ProofSubject,
  nowSeconds: number,
  secret: string,
): string {
  const expiresAt = Math.floor(nowSeconds) + RECOVERY_WINDOW_SECONDS;
  return `${VERSION}.${expiresAt}.${sign(secret, subject, expiresAt).toString("base64url")}`;
}

/**
 * True only for a proof this server signed, for exactly this user and session,
 * that has not expired. Anything else is refused: a missing, malformed, forged
 * or altered value, another user's or session's proof, an expired one, or one
 * that claims to last longer than a proof can.
 */
export function verifyRecoveryProof(
  proof: unknown,
  subject: { userId: unknown; sessionId: unknown },
  nowSeconds: number,
  secret: string | null,
): boolean {
  if (!secret || secret.length < RECOVERY_PROOF_SECRET_MIN) return false;
  if (typeof proof !== "string" || proof.length > 200) return false;
  const { userId, sessionId } = subject;
  if (typeof userId !== "string" || userId.length === 0) return false;
  if (typeof sessionId !== "string" || sessionId.length === 0) return false;

  const parts = proof.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return false;
  if (!/^[1-9]\d{0,11}$/.test(parts[1])) return false;
  const expiresAt = Number(parts[1]);
  if (nowSeconds > expiresAt) return false;
  if (expiresAt - nowSeconds > RECOVERY_WINDOW_SECONDS + 60) return false;

  if (!/^[A-Za-z0-9_-]{43}$/.test(parts[2])) return false;
  const given = Buffer.from(parts[2], "base64url");
  const expected = sign(secret, { userId, sessionId }, expiresAt);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
