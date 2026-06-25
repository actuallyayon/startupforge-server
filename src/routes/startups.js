import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { collections } from '../lib/db.js'
import { verifyToken } from '../middleware/verifyToken.js'
import { requireRole, notBlocked } from '../middleware/requireRole.js'

const router = Router()

const toId = (id) => {
  try {
    return new ObjectId(id)
  } catch {
    return null
  }
}

// ---- Public: list approved startups (supports ?limit and ?featured) ----
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 0, 100)
    const cursor = collections
      .startups()
      .aggregate([
        { $match: { status: 'approved' } },
        { $sort: { created_at: -1 } },
        ...(limit ? [{ $limit: limit }] : []),
        {
          // team size needed = number of opportunities posted by this startup
          $lookup: {
            from: 'opportunities',
            let: { sid: { $toString: '$_id' } },
            pipeline: [{ $match: { $expr: { $eq: ['$startup_id', '$$sid'] } } }, { $count: 'n' }],
            as: 'oppCount',
          },
        },
        {
          $addFields: {
            team_size_needed: { $ifNull: [{ $arrayElemAt: ['$oppCount.n', 0] }, 0] },
          },
        },
        { $project: { oppCount: 0 } },
      ])
    res.json(await cursor.toArray())
  } catch (err) {
    next(err)
  }
})

// ---- Founder: own startups ----
router.get('/mine', verifyToken, requireRole('founder'), async (req, res, next) => {
  try {
    const list = await collections
      .startups()
      .find({ founder_email: req.user.email })
      .sort({ created_at: -1 })
      .toArray()
    res.json(list)
  } catch (err) {
    next(err)
  }
})

// ---- Admin: all startups regardless of status ----
router.get('/all', verifyToken, requireRole('admin'), async (req, res, next) => {
  try {
    const list = await collections.startups().find().sort({ created_at: -1 }).toArray()
    res.json(list)
  } catch (err) {
    next(err)
  }
})

// ---- Public: single startup details ----
router.get('/:id', async (req, res, next) => {
  try {
    const _id = toId(req.params.id)
    if (!_id) return res.status(400).json({ message: 'Invalid id' })
    const startup = await collections.startups().findOne({ _id })
    if (!startup) return res.status(404).json({ message: 'Startup not found' })
    res.json(startup)
  } catch (err) {
    next(err)
  }
})

// ---- Founder: create startup ----
router.post('/', verifyToken, requireRole('founder'), notBlocked, async (req, res, next) => {
  try {
    const { startup_name, logo, industry, description, funding_stage } = req.body
    if (!startup_name || !industry) {
      return res.status(400).json({ message: 'startup_name and industry are required' })
    }
    const doc = {
      startup_name,
      logo: logo || '',
      industry,
      description: description || '',
      funding_stage: funding_stage || 'Idea',
      founder_email: req.user.email, // always from the token, never trusted from body
      status: 'pending',
      created_at: new Date(),
    }
    const result = await collections.startups().insertOne(doc)
    res.status(201).json({ _id: result.insertedId, ...doc })
  } catch (err) {
    next(err)
  }
})

// ---- Founder: update own startup ----
router.put('/:id', verifyToken, requireRole('founder'), async (req, res, next) => {
  try {
    const _id = toId(req.params.id)
    if (!_id) return res.status(400).json({ message: 'Invalid id' })
    const { startup_name, logo, industry, description, funding_stage } = req.body
    const update = { startup_name, logo, industry, description, funding_stage }
    Object.keys(update).forEach((k) => update[k] === undefined && delete update[k])

    const result = await collections
      .startups()
      .updateOne({ _id, founder_email: req.user.email }, { $set: update })
    if (!result.matchedCount) return res.status(404).json({ message: 'Startup not found' })
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// ---- Founder (own) or Admin (any): delete startup ----
router.delete('/:id', verifyToken, requireRole('founder', 'admin'), async (req, res, next) => {
  try {
    const _id = toId(req.params.id)
    if (!_id) return res.status(400).json({ message: 'Invalid id' })
    const filter = req.user.role === 'admin' ? { _id } : { _id, founder_email: req.user.email }
    const result = await collections.startups().deleteOne(filter)
    if (!result.deletedCount) return res.status(404).json({ message: 'Startup not found' })
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// ---- Admin: approve startup ----
router.patch('/:id/approve', verifyToken, requireRole('admin'), async (req, res, next) => {
  try {
    const _id = toId(req.params.id)
    if (!_id) return res.status(400).json({ message: 'Invalid id' })
    const result = await collections.startups().updateOne({ _id }, { $set: { status: 'approved' } })
    if (!result.matchedCount) return res.status(404).json({ message: 'Startup not found' })
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
