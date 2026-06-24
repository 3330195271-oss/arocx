import { Router, Request, Response } from 'express'
import { authMiddleware, requireTier } from '../middleware/auth'
import { query } from '../db'
import { randomBytes } from 'crypto'

const router = Router()

function generateInviteCode(): string {
  return randomBytes(4).toString('hex').toUpperCase()
}

// Create enterprise (Pro+ required)
router.post('/create', authMiddleware, requireTier('team', 'pro'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { name } = req.body

    if (!name || !name.trim()) {
      res.status(400).json({ error: '请输入企业名称' })
      return
    }

    // Check if already in an enterprise
    const existingMembership = await query(
      'SELECT e.name FROM enterprise_members em JOIN enterprises e ON em.enterprise_id = e.id WHERE em.user_id = $1',
      [user.userId]
    )
    if (existingMembership.rows.length > 0) {
      res.status(409).json({ error: `你已在企业「${existingMembership.rows[0].name}」中，请先退出` })
      return
    }

    const code = generateInviteCode()
    const result = await query(
      'INSERT INTO enterprises (name, owner_id, invite_code) VALUES ($1, $2, $3) RETURNING id, name, invite_code',
      [name.trim(), user.userId, code]
    )

    const enterprise = result.rows[0]

    // Add creator as admin member
    await query(
      'INSERT INTO enterprise_members (enterprise_id, user_id, role) VALUES ($1, $2, $3)',
      [enterprise.id, user.userId, 'admin']
    )

    res.json({
      id: enterprise.id,
      name: enterprise.name,
      inviteCode: enterprise.invite_code,
      role: 'admin',
      message: '企业创建成功'
    })
  } catch (err: any) {
    console.error('[enterprise] create error:', err.message)
    res.status(500).json({ error: '创建失败' })
  }
})

// Join enterprise by invite code
router.post('/join', authMiddleware, requireTier('team', 'pro'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { code } = req.body

    if (!code) {
      res.status(400).json({ error: '请输入邀请码' })
      return
    }

    // Check if already in an enterprise
    const existing = await query(
      'SELECT e.name FROM enterprise_members em JOIN enterprises e ON em.enterprise_id = e.id WHERE em.user_id = $1',
      [user.userId]
    )
    if (existing.rows.length > 0) {
      res.status(409).json({ error: `你已在企业「${existing.rows[0].name}」中，请先退出` })
      return
    }

    // Find enterprise by code
    const entResult = await query(
      'SELECT id, name FROM enterprises WHERE invite_code = $1',
      [code.trim().toUpperCase()]
    )
    if (entResult.rows.length === 0) {
      res.status(404).json({ error: '邀请码无效' })
      return
    }

    const enterprise = entResult.rows[0]

    // Join
    await query(
      'INSERT INTO enterprise_members (enterprise_id, user_id, role) VALUES ($1, $2, $3)',
      [enterprise.id, user.userId, 'member']
    )

    res.json({ success: true, enterpriseName: enterprise.name, message: `已加入「${enterprise.name}」` })
  } catch (err: any) {
    console.error('[enterprise] join error:', err.message)
    res.status(500).json({ error: '加入失败' })
  }
})

// Get my enterprise
router.get('/my', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const result = await query(
      `SELECT e.id, e.name, e.invite_code, e.owner_id, em.role, e.created_at
       FROM enterprise_members em JOIN enterprises e ON em.enterprise_id = e.id
       WHERE em.user_id = $1`,
      [user.userId]
    )

    if (result.rows.length === 0) {
      res.json({ enterprise: null })
      return
    }

    res.json({ enterprise: result.rows[0] })
  } catch (err: any) {
    res.status(500).json({ error: '查询失败' })
  }
})

// List members
router.get('/members', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user

    // Get user's enterprise
    const entResult = await query(
      'SELECT enterprise_id, role FROM enterprise_members WHERE user_id = $1',
      [user.userId]
    )
    if (entResult.rows.length === 0) {
      res.status(404).json({ error: '你未加入任何企业' })
      return
    }

    const enterpriseId = entResult.rows[0].enterprise_id

    const result = await query(
      `SELECT u.id, u.email, em.role, em.joined_at
       FROM enterprise_members em JOIN users u ON em.user_id = u.id
       WHERE em.enterprise_id = $1
       ORDER BY em.role = 'admin' DESC, em.joined_at ASC`,
      [enterpriseId]
    )

    res.json({ members: result.rows, myRole: entResult.rows[0].role })
  } catch (err: any) {
    res.status(500).json({ error: '查询失败' })
  }
})

// Kick member (admin only)
router.post('/kick', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { userId } = req.body

    // Check admin
    const adminCheck = await query(
      'SELECT enterprise_id, role FROM enterprise_members WHERE user_id = $1',
      [user.userId]
    )
    if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'admin') {
      res.status(403).json({ error: '仅管理员可移除成员' })
      return
    }

    const enterpriseId = adminCheck.rows[0].enterprise_id

    // Can't kick yourself
    if (userId === user.userId) {
      res.status(400).json({ error: '不能移除自己，请使用退出功能' })
      return
    }

    await query(
      'DELETE FROM enterprise_members WHERE enterprise_id = $1 AND user_id = $2',
      [enterpriseId, userId]
    )

    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: '操作失败' })
  }
})

// Leave enterprise
router.post('/leave', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user

    const memberResult = await query(
      'SELECT em.enterprise_id, em.role, e.owner_id FROM enterprise_members em JOIN enterprises e ON em.enterprise_id = e.id WHERE em.user_id = $1',
      [user.userId]
    )
    if (memberResult.rows.length === 0) {
      res.status(404).json({ error: '未加入任何企业' })
      return
    }

    const { enterprise_id, role, owner_id } = memberResult.rows[0]

    // If admin and there are other members, can't leave
    if (role === 'admin') {
      const memberCount = await query(
        'SELECT COUNT(*) as cnt FROM enterprise_members WHERE enterprise_id = $1',
        [enterprise_id]
      )
      if (parseInt(memberCount.rows[0].cnt) > 1) {
        res.status(400).json({ error: '请先将管理员转让给其他成员，或移除所有成员后再退出' })
        return
      }
      // Last member + admin → delete enterprise
      await query('DELETE FROM enterprise_members WHERE enterprise_id = $1', [enterprise_id])
      await query('DELETE FROM enterprises WHERE id = $1', [enterprise_id])
    } else {
      await query('DELETE FROM enterprise_members WHERE enterprise_id = $1 AND user_id = $2', [enterprise_id, user.userId])
    }

    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: '操作失败' })
  }
})

// Regenerate invite code (admin only)
router.post('/regenerate-code', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user

    const adminCheck = await query(
      'SELECT enterprise_id, role FROM enterprise_members WHERE user_id = $1',
      [user.userId]
    )
    if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'admin') {
      res.status(403).json({ error: '仅管理员可操作' })
      return
    }

    const newCode = generateInviteCode()
    await query(
      'UPDATE enterprises SET invite_code = $1 WHERE id = $2',
      [newCode, adminCheck.rows[0].enterprise_id]
    )

    res.json({ inviteCode: newCode })
  } catch (err: any) {
    res.status(500).json({ error: '操作失败' })
  }
})

// Get enterprise orders (all orders from enterprise members)
router.get('/orders', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user

    const entResult = await query(
      'SELECT enterprise_id FROM enterprise_members WHERE user_id = $1',
      [user.userId]
    )
    if (entResult.rows.length === 0) {
      res.json({ orders: [] })
      return
    }

    const enterpriseId = entResult.rows[0].enterprise_id

    const result = await query(
      `SELECT o.*, u.email as owner_email
       FROM orders o
       JOIN enterprise_members em ON o.user_id = em.user_id
       JOIN users u ON o.user_id = u.id
       WHERE em.enterprise_id = $1
       ORDER BY o.synced_at DESC
       LIMIT 500`,
      [enterpriseId]
    )

    res.json({ orders: result.rows })
  } catch (err: any) {
    res.status(500).json({ error: '查询失败' })
  }
})

// Get enterprise devices (all devices from enterprise members)
router.get('/devices', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user

    const entResult = await query(
      'SELECT enterprise_id FROM enterprise_members WHERE user_id = $1',
      [user.userId]
    )
    if (entResult.rows.length === 0) {
      res.json({ devices: [] })
      return
    }

    const enterpriseId = entResult.rows[0].enterprise_id

    const result = await query(
      `SELECT d.*, u.email as owner_email
       FROM devices d
       JOIN enterprise_members em ON d.user_id = em.user_id
       JOIN users u ON d.user_id = u.id
       WHERE em.enterprise_id = $1
       ORDER BY CASE WHEN d.status = 'idle' THEN 0 ELSE 1 END, d.synced_at DESC
       LIMIT 1000`,
      [enterpriseId]
    )

    res.json({ devices: result.rows })
  } catch (err: any) {
    res.status(500).json({ error: '查询失败' })
  }
})

export default router
