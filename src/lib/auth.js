import { betterAuth } from 'better-auth'
import { mongodbAdapter } from 'better-auth/adapters/mongodb'

let auth

// Build the Better Auth instance against an already-connected Db.
// `image` is a built-in Better Auth user field, so we only add `role` + `isBlocked`.
export function initAuth(db) {
  auth = betterAuth({
    database: mongodbAdapter(db),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:5000',
    trustedOrigins: [process.env.CLIENT_ORIGIN || 'http://localhost:5173'],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 6,
      autoSignIn: true,
    },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      },
    },
    // Map Better Auth's user model onto the spec's `users` collection.
    user: {
      modelName: 'users',
      additionalFields: {
        role: {
          type: 'string',
          required: false,
          defaultValue: 'collaborator',
          input: true, // allow client to set role at registration
        },
        isBlocked: {
          type: 'boolean',
          required: false,
          defaultValue: false,
          input: false, // never settable by the client
        },
      },
    },
    advanced: {
      // Allow cookies to work across the client/server origins in dev + prod.
      defaultCookieAttributes: {
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  })
  return auth
}

export function getAuth() {
  if (!auth) throw new Error('Auth not initialized. Call initAuth(db) first.')
  return auth
}
