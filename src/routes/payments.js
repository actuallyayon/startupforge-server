import { Router } from 'express'
import Stripe from 'stripe'
import { collections } from '../lib/db.js'
import { verifyToken } from '../middleware/verifyToken.js'
import { requireRole } from '../middleware/requireRole.js'

const router = Router()

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder')
const PRICE = parseInt(process.env.PREMIUM_PRICE_CENTS) || 999
const CLIENT = process.env.CLIENT_ORIGIN || 'http://localhost:5173'

// ---- Founder: create a Stripe Checkout session for the premium package ----
router.post('/create-checkout-session', verifyToken, requireRole('founder'), async (req, res, next) => {
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'StartupForge Premium — Unlimited Opportunities',
              description: 'Post unlimited opportunities for your startup.',
            },
            unit_amount: PRICE,
          },
          quantity: 1,
        },
      ],
      customer_email: req.user.email,
      metadata: { user_email: req.user.email },
      success_url: `${CLIENT}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${CLIENT}/dashboard/manage-opportunities?canceled=1`,
    })
    res.json({ url: session.url, id: session.id })
  } catch (err) {
    next(err)
  }
})

// ---- Confirm a checkout session, save the transaction, flip the founder to premium ----
// Called by the Payment Success page with the session_id.
router.post('/confirm', verifyToken, requireRole('founder'), async (req, res, next) => {
  try {
    const { session_id } = req.body
    if (!session_id) return res.status(400).json({ message: 'session_id is required' })

    const session = await stripe.checkout.sessions.retrieve(session_id)
    if (session.payment_status !== 'paid') {
      return res.status(402).json({ message: 'Payment not completed' })
    }

    // Idempotent: don't double-record the same transaction.
    const existing = await collections.payments().findOne({ transaction_id: session.id })
    if (!existing) {
      await collections.payments().insertOne({
        user_email: session.metadata?.user_email || req.user.email,
        amount: (session.amount_total || PRICE) / 100,
        transaction_id: session.id,
        payment_status: session.payment_status,
        paid_at: new Date(),
      })
      await collections
        .users()
        .updateOne({ email: req.user.email }, { $set: { isPremium: true } })
    }

    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// ---- Founder: own payment history ----
router.get('/mine', verifyToken, requireRole('founder'), async (req, res, next) => {
  try {
    const list = await collections
      .payments()
      .find({ user_email: req.user.email })
      .sort({ paid_at: -1 })
      .toArray()
    res.json(list)
  } catch (err) {
    next(err)
  }
})

// ---- Admin: all transactions ----
router.get('/', verifyToken, requireRole('admin'), async (req, res, next) => {
  try {
    const list = await collections.payments().find().sort({ paid_at: -1 }).toArray()
    res.json(list)
  } catch (err) {
    next(err)
  }
})

export default router
