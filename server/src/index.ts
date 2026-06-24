import express from 'express'
import cors from 'cors'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { initDb } from './db'
import authRoutes from './routes/auth'
import syncRoutes from './routes/sync'
import subscriptionRoutes from './routes/subscription'
import activationRoutes from './routes/activation'
import verifyRoutes from './routes/verify'
import aiUsageRoutes from './routes/ai-usage'
import friendsRoutes from './routes/friends'
import collabRoutes from './routes/collab'
import enterpriseRoutes from './routes/enterprise'
import feishuRoutes from './routes/feishu'

const PORT = parseInt(process.env.PORT || '3001')
const APP_DOWNLOADS_DIR = process.env.APP_DOWNLOADS_DIR || join(process.cwd(), 'uploads', 'app')
const WEBSITE_DIR = join(process.cwd(), 'public')

async function main() {
  await initDb()

  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '10mb' }))
  mkdirSync(APP_DOWNLOADS_DIR, { recursive: true })

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() })
  })

  app.use('/downloads/app', express.static(APP_DOWNLOADS_DIR))
  if (existsSync(WEBSITE_DIR)) {
    app.use(express.static(WEBSITE_DIR))
  }

  // Routes
  app.use('/api/auth', authRoutes)
  app.use('/api/sync', syncRoutes)
  app.use('/api/subscription', subscriptionRoutes)
  app.use('/api/activation', activationRoutes)
  app.use('/api/verify', verifyRoutes)
  app.use('/api/ai-usage', aiUsageRoutes)
  app.use('/api/friends', friendsRoutes)
  app.use('/api/collab', collabRoutes)
  app.use('/api/enterprise', enterpriseRoutes)
  app.use('/api/feishu', feishuRoutes)

  app.listen(PORT, () => {
    console.log(`[server] arocx cloud API running on port ${PORT}`)
  })
}

main().catch(err => {
  console.error('[server] Failed to start:', err)
  process.exit(1)
})
