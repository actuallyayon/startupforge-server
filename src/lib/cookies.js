// Shared cookie options for the JWT access_token cookie.
export function tokenCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production'
  return {
    httpOnly: true,
    secure: isProd, // HTTPS only in production
    sameSite: isProd ? 'none' : 'lax', // cross-site in prod (separate client/server domains)
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  }
}
