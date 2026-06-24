import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../db'
import { generateToken, AuthUser, authMiddleware } from '../middleware/auth'

const router = Router()

function getClientDevice(req: Request): { deviceId: string; deviceName: string } {
  const rawDeviceId = req.headers['x-client-device-id']
  const rawDeviceName = req.headers['x-client-device-name']
  const deviceId = typeof rawDeviceId === 'string'
    ? rawDeviceId.trim()
    : Array.isArray(rawDeviceId)
      ? String(rawDeviceId[0] || '').trim()
      : ''
  const deviceName = typeof rawDeviceName === 'string'
    ? rawDeviceName.trim()
    : Array.isArray(rawDeviceName)
      ? String(rawDeviceName[0] || '').trim()
      : ''
  return { deviceId, deviceName: deviceName || '未知设备' }
}

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, verifyCode } = req.body
    const { deviceId, deviceName } = getClientDevice(req)
    if (!email || !password) {
      res.status(400).json({ error: '邮箱和密码不能为空' })
      return
    }
    if (password.length < 6) {
      res.status(400).json({ error: '密码至少 6 位' })
      return
    }
    if (!verifyCode || typeof verifyCode !== 'string') {
      res.status(400).json({ error: '请输入邮箱验证码' })
      return
    }

    const normalizedEmail = email.trim().toLowerCase()

    const existing = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail])
    if (existing.rows.length > 0) {
      res.status(409).json({ error: '该邮箱已注册' })
      return
    }

    const codeResult = await query(
      `SELECT id FROM verification_codes
       WHERE email = $1 AND code = $2 AND expires_at > NOW() AND used = false
       ORDER BY created_at DESC
       LIMIT 1`,
      [normalizedEmail, verifyCode.trim()]
    )
    if (codeResult.rows.length === 0) {
      res.status(400).json({ error: '验证码错误或已过期' })
      return
    }

    const initialSessionVersion = deviceId ? 1 : 0
    const hash = await bcrypt.hash(password, 10)
    const result = await query(
      `INSERT INTO users (
         email, password_hash, subscription_tier,
         active_device_id, active_device_name, session_version, last_login_at
       ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id, email, subscription_tier, active_device_id, session_version`,
      [normalizedEmail, hash, 'free', deviceId || '', deviceId ? deviceName : '', initialSessionVersion]
    )

    await query('UPDATE verification_codes SET used = true WHERE id = $1', [codeResult.rows[0].id])

    const user = result.rows[0]
    const authUser: AuthUser = { userId: user.id, email: user.email, tier: user.subscription_tier }
    const sessionVersion = Number(user.session_version || 0)
    const token = sessionVersion > 0
      ? generateToken({
          ...authUser,
          deviceId: user.active_device_id || deviceId,
          sessionVersion
        })
      : generateToken(authUser)

    res.json({ token, user: authUser })
  } catch (err: any) {
    console.error('[auth] register error:', err.message)
    res.status(500).json({ error: '注册失败' })
  }
})

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body
    const { deviceId, deviceName } = getClientDevice(req)
    if (!email || !password) {
      res.status(400).json({ error: '邮箱和密码不能为空' })
      return
    }
    const normalizedEmail = String(email).trim().toLowerCase()

    const result = await query(
      `SELECT id, email, password_hash, subscription_tier, active_device_id, session_version
         FROM users
        WHERE email = $1`,
      [normalizedEmail]
    )

    if (result.rows.length === 0) {
      res.status(401).json({ error: '邮箱或密码错误' })
      return
    }

    const user = result.rows[0]
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      res.status(401).json({ error: '邮箱或密码错误' })
      return
    }

    if (!deviceId) {
      if (Number(user.session_version || 0) > 0 || user.active_device_id) {
        res.status(401).json({ error: '当前账号已启用单设备登录，请升级到最新版本后重新登录。' })
        return
      }

      const authUser: AuthUser = { userId: user.id, email: user.email, tier: user.subscription_tier }
      const token = generateToken(authUser)
      res.json({ token, user: authUser })
      return
    }

    const sessionResult = await query(
      `UPDATE users
          SET active_device_id = $2,
              active_device_name = $3,
              session_version = COALESCE(session_version, 0) + 1,
              last_login_at = NOW()
        WHERE id = $1
        RETURNING email, subscription_tier, active_device_id, session_version`,
      [user.id, deviceId, deviceName]
    )

    const sessionUser = sessionResult.rows[0]
    const authUser: AuthUser = { userId: user.id, email: sessionUser.email, tier: sessionUser.subscription_tier }
    const token = generateToken({
      ...authUser,
      deviceId: sessionUser.active_device_id || deviceId,
      sessionVersion: Number(sessionUser.session_version || 1)
    })

    res.json({ token, user: authUser })
  } catch (err: any) {
    console.error('[auth] login error:', err.message)
    res.status(500).json({ error: '登录失败' })
  }
})

// Verify token (for app startup)
router.get('/me', authMiddleware, (req: Request, res: Response) => {
  res.json({ user: (req as any).user })
})

export default router
