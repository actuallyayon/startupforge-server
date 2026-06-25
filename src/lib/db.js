import { MongoClient } from 'mongodb'
import dns from 'node:dns'

let client
let db
let connected = false

export async function connectDB() {
  if (connected) return db

  const uri = process.env.MONGODB_URI
  const dbName = process.env.DB_NAME || 'startupforge'
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Copy .env.example to .env and fill it in.')
  }

  // Some networks' default DNS resolver refuses SRV lookups (mongodb+srv://).
  // Point Node at a reliable public resolver when DNS_SERVERS is provided.
  if (process.env.DNS_SERVERS) {
    dns.setServers(process.env.DNS_SERVERS.split(',').map((s) => s.trim()))
  }

  // A single shared client/connection reused by Better Auth and our route handlers.
  client = new MongoClient(uri, { maxPoolSize: 10 })
  await client.connect()
  db = client.db(dbName)
  connected = true
  console.log(`✅ MongoDB connected → ${dbName}`)
  return db
}

// Synchronous accessor — only call after connectDB() has resolved.
export function getDB() {
  if (!db) throw new Error('Database not connected yet. Call connectDB() first.')
  return db
}

export async function closeDB() {
  if (client) await client.close()
  connected = false
}

// Convenience collection getters keep collection names in one place.
export const collections = {
  users: () => getDB().collection('users'),
  startups: () => getDB().collection('startups'),
  opportunities: () => getDB().collection('opportunities'),
  applications: () => getDB().collection('applications'),
  payments: () => getDB().collection('payments'),
}
