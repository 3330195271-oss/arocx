import { Router, Request, Response } from 'express'
import { randomBytes } from 'crypto'
import { query } from '../db'
import { authMiddleware } from '../middleware/auth'
import { getAdminSecret } from '../config'

const router = Router()

// Admin secret for code generation
const ADMIN_SECRET = getAdminSecret()

// Generate a random activation code
function generateCode(): string {
  return 'RJKF-' + randomBytes(4).toString('hex').toUpperCase()
}

// ---- Admin: Generate activation codes ----
router.post('/admin/generate', async (req: Request, res: Response) => {
  try {
    const { adminSecret, tier, count = 1, durationDays = 30 } = req.body

    if (adminSecret !== ADMIN_SECRET) {
      res.status(403).json({ error: '管理员密钥错误' })
      return
    }

    if (!['team', 'pro'].includes(tier)) {
      res.status(400).json({ error: '无效的版本，可选 team / pro' })
      return
    }

    const codes: string[] = []
    for (let i = 0; i < Math.min(count, 100); i++) {
      const code = generateCode()
      await query(
        `INSERT INTO activation_codes (code, tier, duration_days, created_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (code) DO NOTHING`,
        [code, tier, durationDays, 'admin']
      )
      codes.push(code)
    }

    res.json({ codes, tier, durationDays })
  } catch (err: any) {
    console.error('[activation] generate error:', err.message)
    res.status(500).json({ error: '生成失败' })
  }
})

// ---- Admin: List all codes ----
router.post('/admin/list', async (req: Request, res: Response) => {
  try {
    const { adminSecret } = req.body

    if (adminSecret !== ADMIN_SECRET) {
      res.status(403).json({ error: '管理员密钥错误' })
      return
    }

    const result = await query(
      `SELECT code, tier, duration_days, used_by, used_at, created_at
       FROM activation_codes
       ORDER BY created_at DESC
       LIMIT 200`
    )

    res.json({ codes: result.rows })
  } catch (err: any) {
    console.error('[activation] list error:', err.message)
    res.status(500).json({ error: '查询失败' })
  }
})

// ---- User: Redeem a code ----
router.post('/redeem', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { code } = req.body
    const user = (req as any).user

    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: '请输入激活码' })
      return
    }

    const normalized = code.trim().toUpperCase()

    // Find and lock the code
    const codeResult = await query(
      'SELECT id, tier, duration_days FROM activation_codes WHERE code = $1 AND used_by IS NULL',
      [normalized]
    )

    if (codeResult.rows.length === 0) {
      res.status(404).json({ error: '激活码无效或已被使用' })
      return
    }

    const activation = codeResult.rows[0]

    // Calculate new expiry
    const now = new Date()
    let expiresAt: Date

    // If user already has an active subscription of this or higher tier, extend it
    const userResult = await query(
      'SELECT subscription_tier, subscription_expires FROM users WHERE id = $1',
      [user.userId]
    )

    const currentExpiry = userResult.rows[0]?.subscription_expires
      ? new Date(userResult.rows[0].subscription_expires)
      : now

    if (currentExpiry > now) {
      expiresAt = new Date(currentExpiry.getTime() + activation.duration_days * 86400000)
    } else {
      expiresAt = new Date(now.getTime() + activation.duration_days * 86400000)
    }

    // Update user tier and expiry
    await query(
      `UPDATE users SET subscription_tier = $1, subscription_expires = $2 WHERE id = $3`,
      [activation.tier, expiresAt.toISOString(), user.userId]
    )

    // Mark code as used
    await query(
      `UPDATE activation_codes SET used_by = $1, used_at = NOW() WHERE code = $2`,
      [user.userId, normalized]
    )

    res.json({
      success: true,
      tier: activation.tier,
      expiresAt: expiresAt.toISOString(),
      message: `激活成功！已升级到${activation.tier === 'pro' ? 'Plus版' : 'Pro+版'}，有效期至 ${expiresAt.toLocaleDateString('zh-CN')}`
    })
  } catch (err: any) {
    console.error('[activation] redeem error:', err.message)
    res.status(500).json({ error: '激活失败' })
  }
})

// ---- Get activation status (for checking without auth) ----
router.get('/status/:code', async (req: Request, res: Response) => {
  try {
    const code = req.params.code.trim().toUpperCase()
    const result = await query(
      'SELECT code, tier, duration_days, used_by IS NOT NULL as used FROM activation_codes WHERE code = $1',
      [code]
    )

    if (result.rows.length === 0) {
      res.status(404).json({ error: '激活码不存在' })
      return
    }

    const row = result.rows[0]
    res.json({
      code: row.code,
      tier: row.tier,
      durationDays: row.duration_days,
      used: row.used
    })
  } catch (err: any) {
    res.status(500).json({ error: '查询失败' })
  }
})

export default router
