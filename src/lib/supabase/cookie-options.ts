/**
 * Session cookies are only ever read on the server, so they are marked
 * httpOnly: scripts running in the page cannot read the access or refresh token.
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;
