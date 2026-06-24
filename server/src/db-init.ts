/**
 * First-time database setup.
 * Run: npm run db:init
 *
 * Prerequisites:
 *   1. PostgreSQL installed and running
 *   2. Environment variables set (or defaults apply):
 *      DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 */
import { initDb, query } from './db'

async function main() {
  console.log('[db-init] Initializing database...')

  // Create database if not exists (connect to postgres first)
  const { Pool } = await import('pg')
  const adminPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: 'postgres',
    user: process.env.DB_USER || 'warehouse',
    password: process.env.DB_PASSWORD || 'warehouse'
  })

  const dbName = process.env.DB_NAME || 'warehouse'
  const result = await adminPool.query(
    `SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]
  )

  if (result.rows.length === 0) {
    await adminPool.query(`CREATE DATABASE ${dbName}`)
    console.log(`[db-init] Created database: ${dbName}`)
  } else {
    console.log(`[db-init] Database ${dbName} already exists`)
  }

  await adminPool.end()

  // Now initialize tables
  await initDb()
  console.log('[db-init] Done!')
  process.exit(0)
}

main().catch(err => {
  console.error('[db-init] Error:', err)
  process.exit(1)
})
