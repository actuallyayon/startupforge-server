import { Router } from 'express'
import { collections } from '../lib/db.js'
import { verifyToken } from '../middleware/verifyToken.js'
import { requireRole } from '../middleware/requireRole.js'

const router = Router()

// ---- Founder overview: total opportunities, total applications, accepted members ----
router.get('/founder', verifyToken, requireRole('founder'), async (req, res, next) => {
  try {
    const opps = await collections
      .opportunities()
      .find({ founder_email: req.user.email })
      .project({ _id: 1, role_title: 1 })
      .toArray()
    const oppIds = opps.map((o) => o._id.toString())

    const [totalApplications, acceptedMembers] = await Promise.all([
      collections.applications().countDocuments({ opportunity_id: { $in: oppIds } }),
      collections
        .applications()
        .countDocuments({ opportunity_id: { $in: oppIds }, status: 'Accepted' }),
    ])

    // Applications-per-opportunity for the founder chart.
    const perOpp = await collections
      .applications()
      .aggregate([
        { $match: { opportunity_id: { $in: oppIds } } },
        { $group: { _id: '$opportunity_id', count: { $sum: 1 } } },
      ])
      .toArray()
    const countMap = Object.fromEntries(perOpp.map((p) => [p._id, p.count]))
    const chart = opps.map((o) => ({
      name: o.role_title,
      applications: countMap[o._id.toString()] || 0,
    }))

    res.json({
      totalOpportunities: opps.length,
      totalApplications,
      acceptedMembers,
      chart,
    })
  } catch (err) {
    next(err)
  }
})

// ---- Collaborator overview: application counts by status ----
router.get('/collaborator', verifyToken, requireRole('collaborator'), async (req, res, next) => {
  try {
    const byStatus = await collections
      .applications()
      .aggregate([
        { $match: { applicant_email: req.user.email } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ])
      .toArray()
    const map = Object.fromEntries(byStatus.map((s) => [s._id, s.count]))
    res.json({
      total: (map.Pending || 0) + (map.Accepted || 0) + (map.Rejected || 0),
      pending: map.Pending || 0,
      accepted: map.Accepted || 0,
      rejected: map.Rejected || 0,
      chart: [
        { name: 'Pending', value: map.Pending || 0 },
        { name: 'Accepted', value: map.Accepted || 0 },
        { name: 'Rejected', value: map.Rejected || 0 },
      ],
    })
  } catch (err) {
    next(err)
  }
})

// ---- Admin overview: totals + revenue ----
router.get('/admin', verifyToken, requireRole('admin'), async (req, res, next) => {
  try {
    const [totalUsers, totalStartups, totalOpportunities, revenueAgg] = await Promise.all([
      collections.users().countDocuments(),
      collections.startups().countDocuments(),
      collections.opportunities().countDocuments(),
      collections
        .payments()
        .aggregate([
          { $match: { payment_status: 'paid' } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ])
        .toArray(),
    ])

    // Users grouped by role for the admin chart.
    const byRole = await collections
      .users()
      .aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }])
      .toArray()

    res.json({
      totalUsers,
      totalStartups,
      totalOpportunities,
      totalRevenue: revenueAgg[0]?.total || 0,
      chart: byRole.map((r) => ({ name: r._id || 'unknown', value: r.count })),
    })
  } catch (err) {
    next(err)
  }
})

export default router
