import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { fromNodeHeaders } from 'better-auth/node'
import { getAuth } from '../lib/auth.js'
import { collections } from '../lib/db.js'
import { tokenCookieOptions } from '../lib/cookies.js'

const router = Router()

// Issue a JWT (HTTPOnly cookie) for the currently logged-in Better Auth user.
// The client calls this right after a successful login / on app load.
router.post('/', async (req, res, next) => {
  try {
    const session = await getAuth().api.getSession({
      headers: fromNodeHeaders(req.headers),
    })
    if (!session?.user) {
      return res.status(401).json({ message: 'No active session' })
    }

    // Pull the authoritative role from our users collection.
    const dbUser = await collections.users().findOne({ email: session.user.email })
    const role = dbUser?.role || session.user.role || 'collaborator'

    const token = jwt.sign(
      { email: session.user.email, role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    )

    res.cookie('access_token', token, tokenCookieOptions())
    res.json({ success: true, role })
  } catch (err) {
    next(err)
  }
})

// Clear the JWT cookie (called on logout).
router.post('/logout', (req, res) => {
  res.clearCookie('access_token', { ...tokenCookieOptions(), maxAge: undefined })
  res.json({ success: true })
})

export default router
