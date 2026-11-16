import { afterEach, describe, expect, it, vi } from "vitest";

import { RECOVERY_WINDOW_SECONDS } from "@/lib/auth/password-reset";
import {
  RECOVERY_PROOF_SECRET_MIN,
  createRecoveryProof,
  recoveryProofSecret,
  verifyRecoveryProof,
} from "@/lib/auth/recovery-proof";

/**
 * The signed proof that a recovery link was verified. Holding the cookie is
 * not enough: every test below except the first presents a value an attacker
 * could put in their own browser, and each must be refused.
 */

const NOW = 1_800_000_000;
// Made up for these tests. Not used anywhere else.
const SECRET = "unit-test-only-recovery-proof-secret-0001";
const OTHER_SECRET = "unit-test-only-recovery-proof-secret-0002";
const SUBJECT = { userId: "user-1", sessionId: "session-1" };

const issue = (subject = SUBJECT, at = NOW, secret = SECRET) =>
  createRecoveryProof(subject, at, secret);
const accepts = (
  proof: unknown,
  subject: { userId: unknown; sessionId: unknown } = SUBJECT,
  at = NOW,
  secret: string | null = SECRET,
) => verifyRecoveryProof(proof, subject, at, secret);

describe("a recovery proof", () => {
  it("is accepted for the user and session it was issued to, until it expires", () => {
    const proof = issue();
    expect(accepts(proof)).toBe(true);
    expect(accepts(proof, SUBJECT, NOW + RECOVERY_WINDOW_SECONDS)).toBe(true);
    expect(accepts(proof, SUBJECT, NOW + RECOVERY_WINDOW_SECONDS + 1)).toBe(false);
    expect(accepts(proof, SUBJECT, NOW + 24 * 60 * 60)).toBe(false);
  });

  it("lasts 15 minutes", () => {
    expect(RECOVERY_WINDOW_SECONDS).toBe(15 * 60);
    expect(issue().split(".")[1]).toBe(String(NOW + 15 * 60));
  });

  it("contains neither the user id, the session id nor the secret", () => {
    const proof = issue();
    for (const value of [SUBJECT.userId, SUBJECT.sessionId, SECRET]) {
      expect(proof).not.toContain(value);
    }
    expect(proof).toMatch(/^v1\.\d+\.[A-Za-z0-9_-]{43}$/);
  });

  it("is refused for another user or another session", () => {
    const proof = issue();
    expect(accepts(proof, { userId: "user-2", sessionId: "session-1" })).toBe(false);
    expect(accepts(proof, { userId: "user-1", sessionId: "session-2" })).toBe(false);
    // The two ids cannot be shifted into each other.
    expect(accepts(issue({ userId: "ab", sessionId: "c" }), { userId: "a", sessionId: "bc" })).toBe(
      false,
    );
  });

  it("is refused when the request has no user id or session id", () => {
    const proof = issue();
    for (const subject of [
      { userId: undefined, sessionId: "session-1" },
      { userId: "user-1", sessionId: undefined },
      { userId: "", sessionId: "session-1" },
      { userId: "user-1", sessionId: "" },
      { userId: 1, sessionId: 1 },
    ]) {
      expect(accepts(proof, subject)).toBe(false);
    }
  });

  it("is refused when signed with another secret", () => {
    expect(accepts(issue(SUBJECT, NOW, OTHER_SECRET))).toBe(false);
  });

  it("is refused when its expiry was changed", () => {
    const [version, expiry, signature] = issue(SUBJECT, NOW - 3600).split(".");
    expect(accepts([version, expiry, signature].join("."))).toBe(false);
    expect(accepts([version, Number(expiry) + 3600, signature].join("."))).toBe(false);
    expect(accepts([version, NOW + 60, signature].join("."))).toBe(false);
  });

  it("is refused when it claims to last longer than a proof can, even if signed", () => {
    // Signed by the real secret, but dated in the future: not something the server issues.
    expect(accepts(issue(SUBJECT, NOW + 3600))).toBe(false);
  });

  it("is refused when any character of the signature is changed", () => {
    const proof = issue();
    const start = proof.lastIndexOf(".") + 1;
    for (let index = start; index < proof.length; index += 1) {
      const swapped = proof[index] === "A" ? "B" : "A";
      const altered = proof.slice(0, index) + swapped + proof.slice(index + 1);
      // The last character carries spare bits, so one change there can decode to the same bytes.
      if (
        Buffer.from(altered.slice(start), "base64url").equals(
          Buffer.from(proof.slice(start), "base64url"),
        )
      )
        continue;
      expect(accepts(altered), `character ${index}`).toBe(false);
    }
  });

  it("is refused when it is not a proof at all", () => {
    const proof = issue();
    const [version, expiry, signature] = proof.split(".");
    for (const value of [
      undefined,
      null,
      "",
      "forged",
      "session-1",
      SUBJECT.sessionId,
      `${version}.${expiry}`,
      `${version}.${expiry}.`,
      `${version}.${expiry}.${signature}.extra`,
      `v2.${expiry}.${signature}`,
      `${version}.-1.${signature}`,
      `${version}.1e9.${signature}`,
      `${version}.${expiry}.${signature.slice(0, 20)}`,
      `${version}.${expiry}.${"A".repeat(43)}`,
      ` ${proof}`,
      "x".repeat(5000),
      12345,
      { proof },
    ]) {
      expect(accepts(value)).toBe(false);
    }
  });

  it("is refused when the server has no usable secret", () => {
    const proof = issue();
    expect(accepts(proof, SUBJECT, NOW, null)).toBe(false);
    expect(accepts(proof, SUBJECT, NOW, "")).toBe(false);
    // A proof made with a short secret is not accepted with that short secret either.
    expect(accepts(issue(SUBJECT, NOW, "short"), SUBJECT, NOW, "short")).toBe(false);
  });
});

describe("recoveryProofSecret", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the configured secret", () => {
    vi.stubEnv("RECOVERY_PROOF_SECRET", `  ${SECRET}  `);
    expect(recoveryProofSecret()).toBe(SECRET);
  });

  it("returns null when the secret is missing or shorter than 32 characters", () => {
    expect(RECOVERY_PROOF_SECRET_MIN).toBe(32);
    for (const value of ["", "   ", "x".repeat(31)]) {
      vi.stubEnv("RECOVERY_PROOF_SECRET", value);
      expect(recoveryProofSecret()).toBeNull();
    }
    vi.stubEnv("RECOVERY_PROOF_SECRET", "x".repeat(32));
    expect(recoveryProofSecret()).toBe("x".repeat(32));
  });
});
