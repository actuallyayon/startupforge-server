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

// Lookup stages that enrich an application with opportunity + startup names.
const enrichStages = [
  {
    $lookup: {
      from: 'opportunities',
      let: { oid: '$opportunity_id' },
      pipeline: [{ $match: { $expr: { $eq: [{ $toString: '$_id' }, '$$oid'] } } }],
      as: 'opportunity',
    },
  },
  { $unwind: { path: '$opportunity', preserveNullAndEmptyArrays: true } },
  {
    $lookup: {
      from: 'startups',
      let: { sid: '$opportunity.startup_id' },
      pipeline: [{ $match: { $expr: { $eq: [{ $toString: '$_id' }, '$$sid'] } } }],
      as: 'startup',
    },
  },
  { $unwind: { path: '$startup', preserveNullAndEmptyArrays: true } },
  {
    $addFields: {
      role_title: '$opportunity.role_title',
      startup_name: '$startup.startup_name',
    },
  },
]

// ---- Collaborator: apply to an opportunity (default status Pending) ----
router.post('/', verifyToken, requireRole('collaborator'), notBlocked, async (req, res, next) => {
  try {
    const { opportunity_id, portfolio_link, motivation } = req.body
    if (!opportunity_id) return res.status(400).json({ message: 'opportunity_id is required' })

    const oId = toId(opportunity_id)
    const opp = oId && (await collections.opportunities().findOne({ _id: oId }))
    if (!opp) return res.status(404).json({ message: 'Opportunity not found' })

    // Prevent duplicate applications.
    const existing = await collections.applications().findOne({
      opportunity_id,
      applicant_email: req.user.email,
    })
    if (existing) return res.status(409).json({ message: 'You already applied to this opportunity' })

    const doc = {
      opportunity_id,
      applicant_email: req.user.email, // from token
      portfolio_link: portfolio_link || '',
      motivation: motivation || '',
      status: 'Pending',
      applied_at: new Date(),
    }
    const result = await collections.applications().insertOne(doc)
    res.status(201).json({ _id: result.insertedId, ...doc })
  } catch (err) {
    next(err)
  }
})

// ---- Collaborator: my applications ----
router.get('/mine', verifyToken, requireRole('collaborator'), async (req, res, next) => {
  try {
    const list = await collections
      .applications()
      .aggregate([
        { $match: { applicant_email: req.user.email } },
        ...enrichStages,
        { $sort: { applied_at: -1 } },
        { $project: { opportunity: 0, startup: 0 } },
      ])
      .toArray()
    res.json(list)
  } catch (err) {
    next(err)
  }
})

// ---- Founder: all applications to their opportunities ----
router.get('/founder', verifyToken, requireRole('founder'), async (req, res, next) => {
  try {
    // ids of this founder's opportunities (as strings, matching stored opportunity_id)
    const opps = await collections
      .opportunities()
      .find({ founder_email: req.user.email })
      .project({ _id: 1 })
      .toArray()
    const ids = opps.map((o) => o._id.toString())

    const list = await collections
      .applications()
      .aggregate([
        { $match: { opportunity_id: { $in: ids } } },
        ...enrichStages,
        { $sort: { applied_at: -1 } },
        { $project: { opportunity: 0, startup: 0 } },
      ])
      .toArray()
    res.json(list)
  } catch (err) {
    next(err)
  }
})

// ---- Founder: accept / reject an application ----
router.patch('/:id/status', verifyToken, requireRole('founder'), async (req, res, next) => {
  try {
    const _id = toId(req.params.id)
    if (!_id) return res.status(400).json({ message: 'Invalid id' })
    const { status } = req.body
    if (!['Accepted', 'Rejected'].includes(status)) {
      return res.status(400).json({ message: 'status must be Accepted or Rejected' })
    }

    const application = await collections.applications().findOne({ _id })
    if (!application) return res.status(404).json({ message: 'Application not found' })

    // Confirm the application's opportunity belongs to this founder.
    const opp = await collections
      .opportunities()
      .findOne({ _id: toId(application.opportunity_id), founder_email: req.user.email })
    if (!opp) return res.status(403).json({ message: 'Not your opportunity' })

    await collections.applications().updateOne({ _id }, { $set: { status } })
    res.json({ success: true, status })
  } catch (err) {
    next(err)
  }
})

export default router
