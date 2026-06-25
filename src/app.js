import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { toNodeHandler } from 'better-auth/node'

import { connectDB } from './lib/db.js'
import { initAuth } from './lib/auth.js'

import jwtRoutes from './routes/jwt.js'
import startupRoutes from './routes/startups.js'
import opportunityRoutes from './routes/opportunities.js'
import applicationRoutes from './routes/applications.js'
import paymentRoutes from './routes/payments.js'
import userRoutes from './routes/users.js'
import statsRoutes from './routes/stats.js'

// Build the Express app. Safe to call multiple times; DB connects once (cached).
export async function createApp() {
  const db = await connectDB()
  const auth = initAuth(db)

  const app = express()
  app.set('trust proxy', 1) // needed for secure cookies behind a proxy (Vercel/Render)

  // CLIENT_ORIGIN may be a comma-separated list (e.g. prod + localhost).
  const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
  app.use(
    cors({
      origin: (origin, cb) => {
        // allow same-origin / curl (no origin) and any whitelisted client
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
        cb(null, false)
      },
      credentials: true,
    })
  )
  app.use(cookieParser())

  // Better Auth mounts its own handler and MUST come before express.json().
  app.all('/api/auth/*', toNodeHandler(auth))

  // JSON body parser for the rest of the API.
  app.use(express.json())

  app.get('/', (req, res) => res.json({ status: 'ok', service: 'StartupForge API' }))
  app.get('/api/health', (req, res) => res.json({ ok: true }))

  app.use('/api/jwt', jwtRoutes)
  app.use('/api/startups', startupRoutes)
  app.use('/api/opportunities', opportunityRoutes)
  app.use('/api/applications', applicationRoutes)
  app.use('/api/payments', paymentRoutes)
  app.use('/api/users', userRoutes)
  app.use('/api/stats', statsRoutes)

  // 404 for unknown API routes.
  app.use((req, res) => res.status(404).json({ message: 'Not found' }))

  // Central error handler.
  app.use((err, req, res, next) => {
    console.error('Error:', err)
    res.status(err.status || 500).json({ message: err.message || 'Internal server error' })
  })

  return app
}
