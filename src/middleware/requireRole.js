import { collections } from '../lib/db.js'

// Restrict a route to one or more roles. Must run after verifyToken.
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' })
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' })
    }
    next()
  }
}

// Blocks requests from users flagged isBlocked by an admin.
export async function notBlocked(req, res, next) {
  try {
    const user = await collections.users().findOne({ email: req.user.email })
    if (user?.isBlocked) {
      return res.status(403).json({ message: 'Your account has been blocked by an admin.' })
    }
    next()
  } catch (err) {
    next(err)
  }
}
