import jwt from 'jsonwebtoken'

// Verifies the JWT stored in the HTTPOnly cookie set at /api/jwt.
// On success attaches { email, role } to req.user.
export function verifyToken(req, res, next) {
  const token = req.cookies?.access_token
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized: no token' })
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = { email: decoded.email, role: decoded.role }
    next()
  } catch {
    return res.status(401).json({ message: 'Unauthorized: invalid token' })
  }
}
