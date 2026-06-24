import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth'
import { query } from '../db'
import { randomBytes } from 'crypto'
import { getAdminSecret } from '../config'

const router = Router()

// Free: daily 5, Pro+: monthly 1500, Plus: unlimited
const MONTHLY_LIMIT_PRO = 1500
const DAILY_LIMIT_FREE = 5

// Get current period key (daily for free, monthly for pro+)
function getPeriodKey(tier: string): string {
  const now = new Date()
  if (tier === 'team') {
    // Monthly: YYYY-MM
    return now.toISOString().slice(0, 7)
  }
  // Daily: YYYY-MM-DD
  return now.toISOString().slice(0, 10)
}

function getLimit(tier: string): number {
  if (tier === 'pro') return 999999 // Plus unlimited
  if (tier === 'team') return MONTHLY_LIMIT_PRO
  return DAILY_LIMIT_FREE
}

// Get remaining AI usage
router.get('/remaining', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    // Fetch current tier from DB (token may be stale after upgrade)
    const tierResult = await query('SELECT subscription_tier FROM users WHERE id = $1', [user.userId])
    const tier = tierResult.rows[0]?.subscription_tier || user.tier
    const periodKey = getPeriodKey(tier)
    const limit = getLimit(tier)

    const result = await query(
      'SELECT count, extra_used FROM ai_usage WHERE user_id = $1 AND period_key = $2',
      [user.userId, periodKey]
    )

    const used = result.rows.length > 0 ? result.rows[0].count : 0
    const extraUsed = result.rows.length > 0 ? result.rows[0].extra_used || 0 : 0

    // Get extra credits
    const userResult = await query('SELECT extra_credits FROM users WHERE id = $1', [user.userId])
    const extraCredits = userResult.rows[0]?.extra_credits || 0

    const baseRemaining = Math.max(0, limit - used)
    const remaining = baseRemaining + extraCredits

    res.json({
      used,
      limit,
      remaining,
      extraCredits,
      tier,
      periodKey,
      periodType: tier === 'team' ? 'monthly' : 'daily',
    })
  } catch (err: any) {
    res.status(500).json({ error: '查询失败' })
  }
})

// Increment usage
router.post('/increment', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    // Fetch current tier from DB (token may be stale after upgrade)
    const tierResult = await query('SELECT subscription_tier FROM users WHERE id = $1', [user.userId])
    const tier = tierResult.rows[0]?.subscription_tier || user.tier
    const periodKey = getPeriodKey(tier)
    const limit = getLimit(tier)

    const result = await query(
      'SELECT count, extra_used FROM ai_usage WHERE user_id = $1 AND period_key = $2',
      [user.userId, periodKey]
    )

    const used = result.rows.length > 0 ? result.rows[0].count : 0
    const extraUsed = result.rows.length > 0 ? (result.rows[0].extra_used || 0) : 0

    // Check base limit
    let usingExtra = false
    if (used >= limit && tier !== 'pro') {
      // Check extra credits
      const userResult = await query('SELECT extra_credits FROM users WHERE id = $1', [user.userId])
      const extraCredits = userResult.rows[0]?.extra_credits || 0
      if (extraCredits <= 0) {
        const limitLabel = tier === 'team' ? `本月${limit}次` : `每日${limit}次`
        res.status(429).json({ error: `AI 识别次数已用完（${limitLabel}），请充值或升级版本` })
        return
      }
      usingExtra = true
      // Deduct extra credit
      await query('UPDATE users SET extra_credits = extra_credits - 1 WHERE id = $1', [user.userId])
    }

    // Upsert
    if (usingExtra) {
      await query(
        `INSERT INTO ai_usage (user_id, period_key, count, extra_used) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, period_key) DO UPDATE SET extra_used = ai_usage.extra_used + 1`,
        [user.userId, periodKey, used, extraUsed + 1]
      )
    } else {
      await query(
        `INSERT INTO ai_usage (user_id, period_key, count, extra_used) VALUES ($1, $2, 1, $3)
         ON CONFLICT (user_id, period_key) DO UPDATE SET count = ai_usage.count + 1`,
        [user.userId, periodKey, extraUsed]
      )
    }

    // Get updated info
    const updated = await query(
      'SELECT count, extra_used FROM ai_usage WHERE user_id = $1 AND period_key = $2',
      [user.userId, periodKey]
    )
    const newUsed = updated.rows[0].count
    const newExtraUsed = updated.rows[0].extra_used || 0
    const userResult2 = await query('SELECT extra_credits FROM users WHERE id = $1', [user.userId])
    const extraCredits2 = userResult2.rows[0]?.extra_credits || 0

    const baseRemaining = Math.max(0, limit - newUsed)
    const remaining = baseRemaining + extraCredits2

    res.json({ used: newUsed, limit, remaining, extraCredits: extraCredits2, periodType: tier === 'team' ? 'monthly' : 'daily' })
  } catch (err: any) {
    console.error('[ai-usage] increment error:', err.message)
    res.status(500).json({ error: '记录失败' })
  }
})

// ---- Recharge Codes ----
function generateRechargeCode(): string {
  return 'RC-' + randomBytes(4).toString('hex').toUpperCase()
}

router.post('/recharge/generate', async (req: Request, res: Response) => {
  try {
    const { adminSecret, credits = 100, count = 1 } = req.body
    const ADMIN_SECRET = getAdminSecret()

    if (adminSecret !== ADMIN_SECRET) {
      res.status(403).json({ error: '管理员密钥错误' })
      return
    }

    const codes: string[] = []
    for (let i = 0; i < Math.min(count, 100); i++) {
      const code = generateRechargeCode()
      await query(
        `INSERT INTO recharge_codes (code, credits, created_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (code) DO NOTHING`,
        [code, credits, 'admin']
      )
      codes.push(code)
    }

    res.json({ codes, credits })
  } catch (err: any) {
    console.error('[recharge] generate error:', err.message)
    res.status(500).json({ error: '生成失败' })
  }
})

router.post('/recharge/redeem', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code } = req.body
    const user = (req as any).user

    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: '请输入充值码' })
      return
    }

    const normalized = code.trim().toUpperCase()

    const codeResult = await query(
      'SELECT id, credits FROM recharge_codes WHERE code = $1 AND used_by IS NULL',
      [normalized]
    )

    if (codeResult.rows.length === 0) {
      res.status(404).json({ error: '充值码无效或已被使用' })
      return
    }

    const rc = codeResult.rows[0]

    // Add credits to user
    await query('UPDATE users SET extra_credits = COALESCE(extra_credits, 0) + $1 WHERE id = $2', [rc.credits, user.userId])

    // Mark code as used
    await query('UPDATE recharge_codes SET used_by = $1, used_at = NOW() WHERE code = $2', [user.userId, normalized])

    // Get updated credits
    const ur = await query('SELECT extra_credits FROM users WHERE id = $1', [user.userId])

    res.json({
      success: true,
      credits: rc.credits,
      totalCredits: ur.rows[0]?.extra_credits || 0,
      message: `充值成功！获得 ${rc.credits} 次 AI 识别额度，当前共 ${ur.rows[0]?.extra_credits || 0} 次备用额度`
    })
  } catch (err: any) {
    console.error('[recharge] redeem error:', err.message)
    res.status(500).json({ error: '充值失败' })
  }
})

export default router
