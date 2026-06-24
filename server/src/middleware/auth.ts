import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '../config'
import { query } from '../db'

const JWT_SECRET = getJwtSecret()

export interface AuthUser {
  userId: number
  email: string
  tier: string
  subscriptionExpires?: string | null
  createdAt?: string | null
}

export interface AuthTokenClaims extends AuthUser {
  deviceId?: string
  sessionVersion?: number
}

export function generateToken(user: AuthTokenClaims): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: '30d' })
}

function resolveTier(tier: string, subscriptionExpires?: string | null): string {
  if (tier === 'free') return 'free'
  if (!subscriptionExpires) return tier
  return new Date(subscriptionExpires).getTime() > Date.now() ? tier : 'free'
}

function getClientDeviceId(req: Request): string {
  const raw = req.headers['x-client-device-id']
  return typeof raw === 'string' ? raw.trim() : Array.isArray(raw) ? String(raw[0] || '').trim() : ''
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: '未登录' })
    return
  }

  try {
    const token = header.slice(7)
    const decoded = jwt.verify(token, JWT_SECRET) as AuthTokenClaims
    const clientDeviceId = getClientDeviceId(req)
    const result = await query(
      `SELECT email, subscription_tier, subscription_expires, created_at,
              active_device_id, session_version
         FROM users
        WHERE id = $1`,
      [decoded.userId]
    )

    if (result.rows.length === 0) {
      res.status(401).json({ error: '用户不存在' })
      return
    }

    const row = result.rows[0]
    const activeDeviceId = row.active_device_id || ''
    const sessionVersion = Number(row.session_version || 0)

    if (sessionVersion > 0) {
      if (!clientDeviceId) {
        res.status(401).json({ error: '当前账号已启用单设备登录，请升级到最新版本后重新登录。' })
        return
      }
      if (decoded.sessionVersion !== sessionVersion || !decoded.deviceId || decoded.deviceId !== activeDeviceId) {
        res.status(401).json({ error: '你的账号已在另一台设备登录，请重新登录。' })
        return
      }
      if (activeDeviceId && clientDeviceId !== activeDeviceId) {
        res.status(401).json({ error: '你的账号已在另一台设备登录，请重新登录。' })
        return
      }
    }

    ;(req as any).user = {
      userId: decoded.userId,
      email: row.email || decoded.email,
      tier: resolveTier(row.subscription_tier || decoded.tier, row.subscription_expires),
      subscriptionExpires: row.subscription_expires || null,
      createdAt: row.created_at || null
    } satisfies AuthUser
    next()
  } catch (err: any) {
    console.error('[auth] token verify error:', err.message)
    res.status(401).json({ error: '登录已过期，请重新登录' })
  }
}

export function requireTier(...tiers: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as AuthUser | undefined
    if (!user) {
      res.status(401).json({ error: '未登录' })
      return
    }
    if (!tiers.includes(user.tier)) {
      res.status(403).json({ error: '当前版本不支持此功能，请升级' })
      return
    }
    next()
  }
}
