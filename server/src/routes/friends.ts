import { Router, Request, Response } from 'express'
import { authMiddleware, requireTier } from '../middleware/auth'
import { query } from '../db'

const router = Router()

// Send friend request by email
router.post('/request', authMiddleware, requireTier('team', 'pro'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { email } = req.body

    if (!email) {
      res.status(400).json({ error: '请输入好友邮箱' })
      return
    }

    // Can't add yourself
    if (email.toLowerCase() === user.email.toLowerCase()) {
      res.status(400).json({ error: '不能添加自己为好友' })
      return
    }

    // Find target user
    const targetResult = await query('SELECT id, email FROM users WHERE email = $1', [email.toLowerCase()])
    if (targetResult.rows.length === 0) {
      res.status(404).json({ error: '该用户不存在' })
      return
    }

    const friendId = targetResult.rows[0].id

    // Check if already friends
    const existing = await query(
      'SELECT id, status FROM friends WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)',
      [user.userId, friendId]
    )
    if (existing.rows.length > 0) {
      const s = existing.rows[0].status
      if (s === 'accepted') {
        res.status(409).json({ error: '已经是好友了' })
      } else if (s === 'pending') {
        res.status(409).json({ error: '已发送过好友请求，等待对方确认' })
      }
      return
    }

    await query(
      'INSERT INTO friends (user_id, friend_id, status) VALUES ($1, $2, $3)',
      [user.userId, friendId, 'pending']
    )

    res.json({ success: true, message: '好友请求已发送' })
  } catch (err: any) {
    console.error('[friends] request error:', err.message)
    res.status(500).json({ error: '请求失败' })
  }
})

// Get pending requests (sent to me)
router.get('/requests', authMiddleware, requireTier('team', 'pro'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const result = await query(
      `SELECT f.id, f.user_id, f.created_at, u.email
       FROM friends f JOIN users u ON f.user_id = u.id
       WHERE f.friend_id = $1 AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [user.userId]
    )
    res.json({ requests: result.rows })
  } catch (err: any) {
    res.status(500).json({ error: '查询失败' })
  }
})

// Accept friend request
router.post('/accept', authMiddleware, requireTier('team', 'pro'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { requestId } = req.body

    const result = await query(
      'UPDATE friends SET status = $1 WHERE id = $2 AND friend_id = $3 AND status = $4 RETURNING *',
      ['accepted', requestId, user.userId, 'pending']
    )

    if (result.rows.length === 0) {
      res.status(404).json({ error: '请求不存在或已处理' })
      return
    }

    res.json({ success: true, message: '已添加好友' })
  } catch (err: any) {
    res.status(500).json({ error: '操作失败' })
  }
})

// Reject friend request
router.post('/reject', authMiddleware, requireTier('team', 'pro'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { requestId } = req.body

    await query(
      'UPDATE friends SET status = $1 WHERE id = $2 AND friend_id = $3 AND status = $4',
      ['rejected', requestId, user.userId, 'pending']
    )

    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: '操作失败' })
  }
})

// List my friends
router.get('/list', authMiddleware, requireTier('team', 'pro'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const result = await query(
      `SELECT u.id, u.email, f.created_at as friends_since
       FROM friends f JOIN users u ON 
         (f.user_id = u.id AND f.friend_id = $1) OR 
         (f.friend_id = u.id AND f.user_id = $1)
       WHERE f.status = 'accepted' AND u.id != $1
       ORDER BY f.created_at DESC`,
      [user.userId]
    )
    res.json({ friends: result.rows })
  } catch (err: any) {
    res.status(500).json({ error: '查询失败' })
  }
})

// Remove friend
router.delete('/:friendId', authMiddleware, requireTier('team', 'pro'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const friendId = parseInt(req.params.friendId)

    await query(
      `DELETE FROM friends WHERE 
       (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
      [user.userId, friendId]
    )

    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: '操作失败' })
  }
})

export default router
