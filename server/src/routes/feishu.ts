import { Router, Request, Response } from 'express'
import { getAdminSecret } from '../config'
import { bootstrapFeishuOrderTable, bootstrapUserFeishuOrderTable, resolveFeishuConfig, resolveUserFeishuConfig, saveFeishuConfig, saveUserFeishuConfig } from '../feishu'
import { authMiddleware, requireTier } from '../middleware/auth'
import type { AuthUser } from '../middleware/auth'

const router = Router()
const ADMIN_SECRET = getAdminSecret()

function verifyAdminSecret(secret: string): boolean {
  return secret === ADMIN_SECRET
}

router.post('/admin/get', async (req: Request, res: Response) => {
  try {
    const { adminSecret } = req.body
    if (!verifyAdminSecret(adminSecret)) {
      res.status(403).json({ error: '管理员密钥错误' })
      return
    }

    res.json(await resolveFeishuConfig())
  } catch (error: any) {
    res.status(500).json({ error: error.message || '读取飞书配置失败' })
  }
})

router.post('/admin/update', async (req: Request, res: Response) => {
  try {
    const { adminSecret, enabled, appId, appSecret, appToken, tableId, primaryFieldName, baseUrl } = req.body
    if (!verifyAdminSecret(adminSecret)) {
      res.status(403).json({ error: '管理员密钥错误' })
      return
    }

    const config = await saveFeishuConfig({
      enabled: typeof enabled === 'boolean' ? enabled : false,
      appId: typeof appId === 'string' ? appId : '',
      appSecret: typeof appSecret === 'string' ? appSecret : '',
      appToken: typeof appToken === 'string' ? appToken : '',
      tableId: typeof tableId === 'string' ? tableId : '',
      primaryFieldName: typeof primaryFieldName === 'string' ? primaryFieldName : '',
      baseUrl: typeof baseUrl === 'string' ? baseUrl : ''
    })

    res.json({ success: true, config })
  } catch (error: any) {
    res.status(500).json({ error: error.message || '保存飞书配置失败' })
  }
})

router.post('/admin/bootstrap', async (req: Request, res: Response) => {
  try {
    const { adminSecret } = req.body
    if (!verifyAdminSecret(adminSecret)) {
      res.status(403).json({ error: '管理员密钥错误' })
      return
    }

    const config = await bootstrapFeishuOrderTable()
    res.json({ success: true, config })
  } catch (error: any) {
    res.status(500).json({ error: error.message || '飞书建表失败' })
  }
})

router.get('/my', authMiddleware, requireTier('pro'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser
    res.json(await resolveUserFeishuConfig(user.userId))
  } catch (error: any) {
    res.status(500).json({ error: error.message || '读取飞书配置失败' })
  }
})

router.post('/my', authMiddleware, requireTier('pro'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser
    const { enabled, appId, appSecret, appToken, tableId, primaryFieldName, baseUrl } = req.body
    const config = await saveUserFeishuConfig(user.userId, {
      enabled: typeof enabled === 'boolean' ? enabled : false,
      appId: typeof appId === 'string' ? appId : '',
      appSecret: typeof appSecret === 'string' ? appSecret : '',
      appToken: typeof appToken === 'string' ? appToken : '',
      tableId: typeof tableId === 'string' ? tableId : '',
      primaryFieldName: typeof primaryFieldName === 'string' ? primaryFieldName : '',
      baseUrl: typeof baseUrl === 'string' ? baseUrl : ''
    })

    res.json({ success: true, config })
  } catch (error: any) {
    res.status(500).json({ error: error.message || '保存飞书配置失败' })
  }
})

router.post('/my/bootstrap', authMiddleware, requireTier('pro'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser
    const config = await bootstrapUserFeishuOrderTable(user)
    res.json({ success: true, config })
  } catch (error: any) {
    res.status(500).json({ error: error.message || '飞书建表失败' })
  }
})

export default router
