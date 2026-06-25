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

const FREE_OPPORTUNITY_LIMIT = 3

// ---- Public: browse opportunities with search + filter + server-side pagination ----
// Challenge #1 ($regex search), #2 ($in filter), #4 (server-side pagination).
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1)
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 6, 1), 50)
    const skip = (page - 1) * limit

    const { search, work_type, industry } = req.query

    // Build the match stage incrementally.
    const match = {}

    // Challenge #1 — search by role title OR required skills using $regex.
    if (search) {
      const rx = { $regex: search, $options: 'i' }
      match.$or = [{ role_title: rx }, { required_skills: rx }]
    }

    // Challenge #2 — filter by work_type using $in (comma-separated -> array).
    if (work_type) {
      match.work_type = { $in: work_type.split(',').map((s) => s.trim()).filter(Boolean) }
    }

    // industry lives on the startup, so we $lookup then filter with $in.
    const industryList = industry
      ? industry.split(',').map((s) => s.trim()).filter(Boolean)
      : null

    const pipeline = [
      { $match: match },
      {
        $lookup: {
          from: 'startups',
          let: { sid: '$startup_id' },
          pipeline: [{ $match: { $expr: { $eq: [{ $toString: '$_id' }, '$$sid'] } } }],
          as: 'startup',
        },
      },
      { $unwind: { path: '$startup', preserveNullAndEmptyArrays: true } },
      ...(industryList ? [{ $match: { 'startup.industry': { $in: industryList } } }] : []),
      {
        $addFields: {
          startup_name: '$startup.startup_name',
          industry: '$startup.industry',
        },
      },
      { $project: { startup: 0 } },
      { $sort: { created_at: -1 } },
      // facet gives us the page slice + total count in one round-trip
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          meta: [{ $count: 'total' }],
        },
      },
    ]

    const [result] = await collections.opportunities().aggregate(pipeline).toArray()
    const total = result?.meta?.[0]?.total || 0
    res.json({
      data: result?.data || [],
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    })
  } catch (err) {
    next(err)
  }
})

// ---- Distinct filter values to populate the filter UI ----
router.get('/filters', async (req, res, next) => {
  try {
    const [workTypes, industries] = await Promise.all([
      collections.opportunities().distinct('work_type'),
      collections.startups().distinct('industry', { status: 'approved' }),
    ])
    res.json({ workTypes: workTypes.filter(Boolean), industries: industries.filter(Boolean) })
  } catch (err) {
    next(err)
  }
})

// ---- Founder: opportunities for their own startup(s) ----
router.get('/mine', verifyToken, requireRole('founder'), async (req, res, next) => {
  try {
    const list = await collections
      .opportunities()
      .find({ founder_email: req.user.email })
      .sort({ created_at: -1 })
      .toArray()
    res.json(list)
  } catch (err) {
    next(err)
  }
})

// ---- Public: single opportunity details (with startup info) ----
router.get('/:id', async (req, res, next) => {
  try {
    const _id = toId(req.params.id)
    if (!_id) return res.status(400).json({ message: 'Invalid id' })
    const [opp] = await collections
      .opportunities()
      .aggregate([
        { $match: { _id } },
        {
          $lookup: {
            from: 'startups',
            let: { sid: '$startup_id' },
            pipeline: [{ $match: { $expr: { $eq: [{ $toString: '$_id' }, '$$sid'] } } }],
            as: 'startup',
          },
        },
        { $unwind: { path: '$startup', preserveNullAndEmptyArrays: true } },
      ])
      .toArray()
    if (!opp) return res.status(404).json({ message: 'Opportunity not found' })
    res.json(opp)
  } catch (err) {
    next(err)
  }
})

// ---- Founder: create opportunity (enforces the free 3-post limit) ----
router.post('/', verifyToken, requireRole('founder'), notBlocked, async (req, res, next) => {
  try {
    const { startup_id, role_title, required_skills, work_type, commitment_level, deadline } = req.body
    if (!startup_id || !role_title) {
      return res.status(400).json({ message: 'startup_id and role_title are required' })
    }

    // Verify the startup belongs to this founder.
    const sId = toId(startup_id)
    const startup = sId && (await collections.startups().findOne({ _id: sId }))
    if (!startup || startup.founder_email !== req.user.email) {
      return res.status(403).json({ message: 'You can only post for your own startup' })
    }

    // Premium gate: free founders may post at most 3 opportunities.
    const count = await collections.opportunities().countDocuments({ founder_email: req.user.email })
    const user = await collections.users().findOne({ email: req.user.email })
    if (count >= FREE_OPPORTUNITY_LIMIT && !user?.isPremium) {
      return res.status(402).json({
        message: 'Free limit reached. Upgrade to premium to post more opportunities.',
        code: 'PREMIUM_REQUIRED',
      })
    }

    const doc = {
      startup_id,
      role_title,
      required_skills: Array.isArray(required_skills)
        ? required_skills
        : String(required_skills || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
      work_type: work_type || 'Remote',
      commitment_level: commitment_level || 'Part-time',
      deadline: deadline ? new Date(deadline) : null,
      founder_email: req.user.email,
      created_at: new Date(),
    }
    const result = await collections.opportunities().insertOne(doc)
    res.status(201).json({ _id: result.insertedId, ...doc })
  } catch (err) {
    next(err)
  }
})

// ---- Founder: update own opportunity ----
router.put('/:id', verifyToken, requireRole('founder'), async (req, res, next) => {
  try {
    const _id = toId(req.params.id)
    if (!_id) return res.status(400).json({ message: 'Invalid id' })
    const { role_title, required_skills, work_type, commitment_level, deadline } = req.body
    const update = { role_title, work_type, commitment_level }
    if (required_skills !== undefined) {
      update.required_skills = Array.isArray(required_skills)
        ? required_skills
        : String(required_skills).split(',').map((s) => s.trim()).filter(Boolean)
    }
    if (deadline !== undefined) update.deadline = deadline ? new Date(deadline) : null
    Object.keys(update).forEach((k) => update[k] === undefined && delete update[k])

    const result = await collections
      .opportunities()
      .updateOne({ _id, founder_email: req.user.email }, { $set: update })
    if (!result.matchedCount) return res.status(404).json({ message: 'Opportunity not found' })
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// ---- Founder: delete own opportunity ----
router.delete('/:id', verifyToken, requireRole('founder'), async (req, res, next) => {
  try {
    const _id = toId(req.params.id)
    if (!_id) return res.status(400).json({ message: 'Invalid id' })
    const result = await collections
      .opportunities()
      .deleteOne({ _id, founder_email: req.user.email })
    if (!result.deletedCount) return res.status(404).json({ message: 'Opportunity not found' })
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

export default router
