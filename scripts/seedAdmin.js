import 'dotenv/config'
import { connectDB, collections, closeDB } from '../src/lib/db.js'
import { initAuth, getAuth } from '../src/lib/auth.js'

// Registration only offers Founder/Collaborator, so the admin is seeded here.
async function run() {
  const db = await connectDB()
  initAuth(db)
  const auth = getAuth()

  const name = process.env.ADMIN_NAME || 'Platform Admin'
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD

  if (!email || !password) {
    console.error('❌ Set ADMIN_EMAIL and ADMIN_PASSWORD in .env first.')
    process.exit(1)
  }

  const existing = await collections.users().findOne({ email })
  if (existing) {
    await collections.users().updateOne({ email }, { $set: { role: 'admin', isBlocked: false } })
    console.log(`✅ Existing user ${email} promoted to admin.`)
  } else {
    // Create through Better Auth so the password hash is compatible.
    await auth.api.signUpEmail({ body: { name, email, password, role: 'admin' } })
    await collections.users().updateOne({ email }, { $set: { role: 'admin', isBlocked: false } })
    console.log(`✅ Admin created: ${email}`)
  }

  await closeDB()
  process.exit(0)
}

run().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
