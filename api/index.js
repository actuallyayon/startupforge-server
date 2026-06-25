import 'dotenv/config'
import { createApp } from '../src/app.js'

// Vercel serverless entry. The Express app is built once and cached across
// warm invocations; the DB connection is reused via the cached client.
let cachedApp

export default async function handler(req, res) {
  if (!cachedApp) {
    cachedApp = await createApp()
  }
  return cachedApp(req, res)
}
