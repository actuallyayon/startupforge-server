import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { collections } from '../lib/db.js'
import { verifyToken } from '../middleware/verifyToken.js'
import { requireRole } from '../middleware/requireRole.js'

const router = Router()

const toId = (id) => {
  try {
    return new ObjectId(id)
  } catch {
    return null
  }
}

// ---- Current user's profile (any authenticated role) ----
router.get('/me', verifyToken, async (req, res, next) => {
  try {
    const user = await collections
      .users()
      .findOne({ email: req.user.email }, { projection: { password: 0 } })
    res.json(user)
  } catch (err) {
    next(err)
  }
})

// ---- Update own profile (name, image, skills, bio) ----
router.patch('/me', verifyToken, async (req, res, next) => {
  try {
    const { name, image, skills, bio } = req.body
    const update = { name, image, bio }
    if (skills !== undefined) {
      update.skills = Array.isArray(skills)
        ? skills
        : String(skills).split(',').map((s) => s.trim()).filter(Boolean)
    }
    Object.keys(update).forEach((k) => update[k] === undefined && delete update[k])
    await collections.users().updateOne({ email: req.user.email }, { $set: update })
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// ---- Admin: list all users ----
router.get('/', verifyToken, requireRole('admin'), async (req, res, next) => {
  try {
    const users = await collections
      .users()
      .find({}, { projection: { password: 0 } })
      .sort({ createdAt: -1 })
      .toArray()
    res.json(users)
  } catch (err) {
    next(err)
  }
})

// ---- Admin: block / unblock a user ----
router.patch('/:id/block', verifyToken, requireRole('admin'), async (req, res, next) => {
  try {
    const _id = toId(req.params.id)
    if (!_id) return res.status(400).json({ message: 'Invalid id' })
    const { isBlocked } = req.body
    const result = await collections
      .users()
      .updateOne({ _id }, { $set: { isBlocked: !!isBlocked } })
    if (!result.matchedCount) return res.status(404).json({ message: 'User not found' })
    res.json({ success: true, isBlocked: !!isBlocked })
  } catch (err) {
    next(err)
  }
})

export default router
