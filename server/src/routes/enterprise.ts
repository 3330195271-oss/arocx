import { Router, Request, Response } from 'express'
import { authMiddleware, requireTier } from '../middleware/auth'
import { query } from '../db'
import { randomBytes } from 'crypto'
import { syncOrderToFeishu } from '../feishu'
import type { AuthUser } from '../middleware/auth'

const router = Router()

function generateInviteCode(): string {
  return randomBytes(4).toString('hex').toUpperCase()
}

function generateEntityId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function getTodayStr(): string {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function rowToOrder(row: any) {
  return {
    id: row.id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerAddress: row.customer_address,
    platform: row.platform,
    csRep: row.cs_rep,
    remarks: row.remarks,
    deviceId: row.device_id,
    serialNumber: row.serial_number,
    trackingNumber: row.tracking_number,
    shipmentDate: row.shipment_date,
    rentalStart: row.rental_start,
    rentalEnd: row.rental_end,
    dispatchDate: row.dispatch_date,
    returnDate: row.return_date,
    status: row.status,
    forwardedFromOrderId: row.forwarded_from_order_id,
    forwardedToOrderId: row.forwarded_to_order_id,
    forwardTracking: row.forward_tracking,
    friendDispatchHelperUserId: row.friend_dispatch_helper_user_id || undefined,
    friendDispatchHelperEmail: row.friend_dispatch_helper_email || '',
    feishuRecordId: row.feishu_record_id || '',
    feishuSyncStatus: row.feishu_sync_status || '',
    feishuSyncError: row.feishu_sync_error || '',
    feishuSyncedAt: row.feishu_synced_at ? new Date(row.feishu_synced_at).toISOString() : ''
  }
}

type EnterpriseContext = {
  enterpriseId: number
  enterpriseName: string
  ownerId: number
  ownerEmail: string
  ownerTier: string
  ownerSubscriptionExpires: string | null
  ownerCreatedAt: string | null
  role: string
}

function buildOwnerUser(row: any): AuthUser {
  return {
    userId: row.user_id,
    email: row.owner_email,
    tier: row.subscription_tier || 'free',
    subscriptionExpires: row.subscription_expires || null,
    createdAt: row.owner_created_at || null
  }
}

async function getEnterpriseContext(userId: number): Promise<EnterpriseContext | null> {
  const result = await query(
    `SELECT
       e.id AS enterprise_id,
       e.name AS enterprise_name,
       e.owner_id,
       em.role,
       owner.email AS owner_email,
       owner.subscription_tier AS owner_tier,
       owner.subscription_expires AS owner_subscription_expires,
       owner.created_at AS owner_created_at
     FROM enterprise_members em
     JOIN enterprises e ON em.enterprise_id = e.id
     JOIN users owner ON e.owner_id = owner.id
     WHERE em.user_id = $1
     LIMIT 1`,
    [userId]
  )

  if (result.rows.length === 0) return null

  const row = result.rows[0]
  return {
    enterpriseId: row.enterprise_id,
    enterpriseName: row.enterprise_name,
    ownerId: row.owner_id,
    ownerEmail: row.owner_email,
    ownerTier: row.owner_tier || 'free',
    ownerSubscriptionExpires: row.owner_subscription_expires || null,
    ownerCreatedAt: row.owner_created_at || null,
    role: row.role
  }
}

function withEnterpriseOwnerMeta(row: any, context: EnterpriseContext): any {
  return {
    ...row,
    owner_email: context.ownerEmail,
    subscription_tier: context.ownerTier,
    subscription_expires: context.ownerSubscriptionExpires,
    owner_created_at: context.ownerCreatedAt
  }
}

function buildEnterpriseOwnerUser(context: EnterpriseContext): AuthUser {
  return {
    userId: context.ownerId,
    email: context.ownerEmail,
    tier: context.ownerTier,
    subscriptionExpires: context.ownerSubscriptionExpires,
    createdAt: context.ownerCreatedAt
  }
}

async function findEnterpriseOrder(requesterUserId: number, orderId: string): Promise<any | null> {
  const context = await getEnterpriseContext(requesterUserId)
  if (!context) return null

  const result = await query(
    `SELECT *
     FROM orders
     WHERE user_id = $1 AND id = $2
     LIMIT 1`,
    [context.ownerId, orderId]
  )

  return result.rows[0] ? withEnterpriseOwnerMeta(result.rows[0], context) : null
}

async function findEnterpriseDeviceById(requesterUserId: number, deviceId: string): Promise<any | null> {
  const context = await getEnterpriseContext(requesterUserId)
  if (!context) return null

  const result = await query(
    `SELECT *
     FROM devices
     WHERE user_id = $1 AND id = $2
     LIMIT 1`,
    [context.ownerId, deviceId]
  )

  return result.rows[0] ? { ...result.rows[0], owner_email: context.ownerEmail } : null
}

async function findEnterpriseDeviceBySerial(requesterUserId: number, serialNumber: string): Promise<any | null> {
  const context = await getEnterpriseContext(requesterUserId)
  if (!context) return null

  const result = await query(
    `SELECT *
     FROM devices
     WHERE user_id = $1 AND LOWER(serial_number) = LOWER($2)
     ORDER BY CASE WHEN status = 'idle' THEN 0 ELSE 1 END, synced_at DESC
     LIMIT 1`,
    [context.ownerId, serialNumber]
  )

  return result.rows[0] ? { ...result.rows[0], owner_email: context.ownerEmail } : null
}

async function replaceEnterpriseOrdersSnapshot(context: EnterpriseContext, submittedOrders: any[]): Promise<{ upserted: number; deleted: number }> {
  let upserted = 0
  const submittedIds: string[] = []

  for (const order of submittedOrders) {
    const normalizedOrder = {
      id: order.id,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerAddress: order.customerAddress,
      platform: order.platform || '',
      csRep: order.csRep || '',
      remarks: order.remarks || '',
      deviceId: order.deviceId || '',
      serialNumber: order.serialNumber || '',
      trackingNumber: order.trackingNumber || '',
      shipmentDate: order.shipmentDate || '',
      rentalStart: order.rentalStart || '',
      rentalEnd: order.rentalEnd || '',
      dispatchDate: order.dispatchDate || '',
      returnDate: order.returnDate || '',
      status: order.status || 'pending',
      forwardedFromOrderId: order.forwardedFromOrderId || '',
      forwardedToOrderId: order.forwardedToOrderId || '',
      forwardTracking: order.forwardTracking || '',
      friendDispatchHelperUserId: order.friendDispatchHelperUserId || null,
      friendDispatchHelperEmail: order.friendDispatchHelperEmail || '',
      feishuRecordId: order.feishuRecordId || '',
      feishuSyncStatus: order.feishuSyncStatus || '',
      feishuSyncError: order.feishuSyncError || '',
      feishuSyncedAt: order.feishuSyncedAt || ''
    }

    if (normalizedOrder.id) {
      submittedIds.push(normalizedOrder.id)
    }

    await query(
      `INSERT INTO orders (
         id, user_id, customer_name, customer_phone, customer_address,
         platform, cs_rep, remarks, device_id, serial_number, tracking_number,
         shipment_date, rental_start, rental_end, dispatch_date, return_date,
         status, forwarded_from_order_id, forwarded_to_order_id, forward_tracking,
         friend_dispatch_helper_user_id, friend_dispatch_helper_email,
         feishu_record_id, feishu_sync_status, feishu_sync_error, feishu_synced_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
       ON CONFLICT (id) DO UPDATE SET
         customer_name = EXCLUDED.customer_name,
         customer_phone = EXCLUDED.customer_phone,
         customer_address = EXCLUDED.customer_address,
         platform = EXCLUDED.platform,
         cs_rep = EXCLUDED.cs_rep,
         remarks = EXCLUDED.remarks,
         device_id = EXCLUDED.device_id,
         serial_number = EXCLUDED.serial_number,
         tracking_number = EXCLUDED.tracking_number,
         shipment_date = EXCLUDED.shipment_date,
         rental_start = EXCLUDED.rental_start,
         rental_end = EXCLUDED.rental_end,
         dispatch_date = EXCLUDED.dispatch_date,
         return_date = EXCLUDED.return_date,
         status = EXCLUDED.status,
         forwarded_from_order_id = EXCLUDED.forwarded_from_order_id,
         forwarded_to_order_id = EXCLUDED.forwarded_to_order_id,
         forward_tracking = EXCLUDED.forward_tracking,
         friend_dispatch_helper_user_id = EXCLUDED.friend_dispatch_helper_user_id,
         friend_dispatch_helper_email = EXCLUDED.friend_dispatch_helper_email,
         feishu_record_id = EXCLUDED.feishu_record_id,
         feishu_sync_status = EXCLUDED.feishu_sync_status,
         feishu_sync_error = EXCLUDED.feishu_sync_error,
         feishu_synced_at = EXCLUDED.feishu_synced_at,
         synced_at = NOW()`,
      [
        normalizedOrder.id,
        context.ownerId,
        normalizedOrder.customerName,
        normalizedOrder.customerPhone,
        normalizedOrder.customerAddress,
        normalizedOrder.platform,
        normalizedOrder.csRep,
        normalizedOrder.remarks,
        normalizedOrder.deviceId,
        normalizedOrder.serialNumber,
        normalizedOrder.trackingNumber,
        normalizedOrder.shipmentDate,
        normalizedOrder.rentalStart,
        normalizedOrder.rentalEnd,
        normalizedOrder.dispatchDate,
        normalizedOrder.returnDate,
        normalizedOrder.status,
        normalizedOrder.forwardedFromOrderId,
        normalizedOrder.forwardedToOrderId,
        normalizedOrder.forwardTracking,
        normalizedOrder.friendDispatchHelperUserId,
        normalizedOrder.friendDispatchHelperEmail,
        normalizedOrder.feishuRecordId,
        normalizedOrder.feishuSyncStatus,
        normalizedOrder.feishuSyncError,
        normalizedOrder.feishuSyncedAt ? new Date(normalizedOrder.feishuSyncedAt) : null
      ]
    )

    if (normalizedOrder.feishuSyncStatus === 'pending') {
      const syncMeta = await syncOrderToFeishu(normalizedOrder, buildEnterpriseOwnerUser(context))
      if (syncMeta) {
        await query(
          `UPDATE orders
           SET feishu_record_id = $2,
               feishu_sync_status = $3,
               feishu_sync_error = $4,
               feishu_synced_at = $5,
               synced_at = NOW()
           WHERE id = $1 AND user_id = $6`,
          [
            normalizedOrder.id,
            syncMeta.feishuRecordId || '',
            syncMeta.feishuSyncStatus,
            syncMeta.feishuSyncError || '',
            syncMeta.feishuSyncedAt ? new Date(syncMeta.feishuSyncedAt) : null,
            context.ownerId
          ]
        )
      }
    }

    upserted += 1
  }

  let deleted = 0
  if (submittedIds.length > 0) {
    await query(
      `DELETE FROM order_collaborators
       WHERE order_id IN (
         SELECT id FROM orders
         WHERE user_id = $1 AND NOT (id = ANY($2::varchar[]))
       )`,
      [context.ownerId, submittedIds]
    )
    const deleteResult = await query(
      'DELETE FROM orders WHERE user_id = $1 AND NOT (id = ANY($2::varchar[]))',
      [context.ownerId, submittedIds]
    )
    deleted = deleteResult.rowCount || 0
  } else {
    await query(
      'DELETE FROM order_collaborators WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)',
      [context.ownerId]
    )
    const deleteResult = await query('DELETE FROM orders WHERE user_id = $1', [context.ownerId])
    deleted = deleteResult.rowCount || 0
  }

  return { upserted, deleted }
}

async function replaceEnterpriseDevicesSnapshot(context: EnterpriseContext, submittedDevices: any[]): Promise<{ upserted: number; deleted: number }> {
  let upserted = 0
  const submittedIds: string[] = []

  for (const device of submittedDevices) {
    if (device.id) {
      submittedIds.push(device.id)
    }

    await query(
      `INSERT INTO devices (id, user_id, serial_number, device_id, status, current_order_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET
         serial_number = EXCLUDED.serial_number,
         device_id = EXCLUDED.device_id,
         status = EXCLUDED.status,
         current_order_id = EXCLUDED.current_order_id,
         synced_at = NOW()`,
      [
        device.id,
        context.ownerId,
        device.serialNumber,
        device.deviceId,
        device.status,
        device.currentOrderId || '',
        device.createdAt || ''
      ]
    )

    upserted += 1
  }

  let deleted = 0
  if (submittedIds.length > 0) {
    const deleteResult = await query(
      'DELETE FROM devices WHERE user_id = $1 AND NOT (id = ANY($2::varchar[]))',
      [context.ownerId, submittedIds]
    )
    deleted = deleteResult.rowCount || 0
  } else {
    const deleteResult = await query('DELETE FROM devices WHERE user_id = $1', [context.ownerId])
    deleted = deleteResult.rowCount || 0
  }

  return { upserted, deleted }
}

async function syncEnterpriseOrderFeishu(row: any): Promise<any> {
  const syncMeta = await syncOrderToFeishu(rowToOrder(row), buildOwnerUser(row))
  if (!syncMeta) return row

  const result = await query(
    `UPDATE orders
     SET feishu_record_id = $2,
         feishu_sync_status = $3,
         feishu_sync_error = $4,
         feishu_synced_at = $5,
         synced_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      row.id,
      syncMeta.feishuRecordId || '',
      syncMeta.feishuSyncStatus,
      syncMeta.feishuSyncError || '',
      syncMeta.feishuSyncedAt ? new Date(syncMeta.feishuSyncedAt) : null
    ]
  )

  return {
    ...result.rows[0],
    owner_email: row.owner_email,
    subscription_tier: row.subscription_tier,
    subscription_expires: row.subscription_expires,
    owner_created_at: row.owner_created_at
  }
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

router.get('/sync/orders', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const context = await getEnterpriseContext(user.userId)

    if (!context) {
      res.json([])
      return
    }

    const result = await query(
      'SELECT * FROM orders WHERE user_id = $1 ORDER BY synced_at DESC',
      [context.ownerId]
    )

    res.json(result.rows.map(rowToOrder))
  } catch (err: any) {
    console.error('[enterprise] pull sync orders error:', err.message)
    res.status(500).json({ error: '拉取企业订单失败' })
  }
})

router.post('/sync/orders', authMiddleware, requireTier('team', 'pro'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const context = await getEnterpriseContext(user.userId)
    const { orders } = req.body

    if (!context) {
      res.status(404).json({ error: '你未加入任何企业' })
      return
    }
    if (!Array.isArray(orders)) {
      res.status(400).json({ error: 'orders 必须是数组' })
      return
    }

    const result = await replaceEnterpriseOrdersSnapshot(context, orders)
    res.json(result)
  } catch (err: any) {
    console.error('[enterprise] push sync orders error:', err.message)
    res.status(500).json({ error: err.message || '同步企业订单失败' })
  }
})

router.get('/sync/devices', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const context = await getEnterpriseContext(user.userId)

    if (!context) {
      res.json([])
      return
    }

    const result = await query(
      'SELECT * FROM devices WHERE user_id = $1 ORDER BY CASE WHEN status = \'idle\' THEN 0 ELSE 1 END, synced_at DESC',
      [context.ownerId]
    )

    res.json(result.rows.map(row => ({
      id: row.id,
      serialNumber: row.serial_number,
      deviceId: row.device_id,
      status: row.status,
      currentOrderId: row.current_order_id || undefined,
      createdAt: row.created_at
    })))
  } catch (err: any) {
    console.error('[enterprise] pull sync devices error:', err.message)
    res.status(500).json({ error: '拉取企业设备失败' })
  }
})

router.post('/sync/devices', authMiddleware, requireTier('team', 'pro'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const context = await getEnterpriseContext(user.userId)
    const { devices } = req.body

    if (!context) {
      res.status(404).json({ error: '你未加入任何企业' })
      return
    }
    if (!Array.isArray(devices)) {
      res.status(400).json({ error: 'devices 必须是数组' })
      return
    }

    const result = await replaceEnterpriseDevicesSnapshot(context, devices)
    res.json(result)
  } catch (err: any) {
    console.error('[enterprise] push sync devices error:', err.message)
    res.status(500).json({ error: err.message || '同步企业设备失败' })
  }
})

// Get enterprise orders (owner workspace only)
router.get('/orders', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const context = await getEnterpriseContext(user.userId)
    if (!context) {
      res.json({ orders: [] })
      return
    }

    const result = await query(
      `SELECT *
       FROM orders
       WHERE user_id = $1
       ORDER BY synced_at DESC
       LIMIT 500`,
      [context.ownerId]
    )

    res.json({ orders: result.rows.map(row => ({ ...row, owner_email: context.ownerEmail })) })
  } catch (err: any) {
    res.status(500).json({ error: '查询失败' })
  }
})

// Get enterprise devices (owner workspace only)
router.get('/devices', authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const context = await getEnterpriseContext(user.userId)
    if (!context) {
      res.json({ devices: [] })
      return
    }

    const result = await query(
      `SELECT *
       FROM devices
       WHERE user_id = $1
       ORDER BY CASE WHEN status = 'idle' THEN 0 ELSE 1 END, synced_at DESC
       LIMIT 1000`,
      [context.ownerId]
    )

    res.json({ devices: result.rows.map(row => ({ ...row, owner_email: context.ownerEmail })) })
  } catch (err: any) {
    res.status(500).json({ error: '查询失败' })
  }
})

router.delete('/orders/:orderId', authMiddleware, requireTier('team', 'pro'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const order = await findEnterpriseOrder(user.userId, req.params.orderId)
    if (!order) {
      res.status(404).json({ error: '未找到企业订单' })
      return
    }
    if (order.status !== 'pending') {
      res.status(400).json({ error: '只有待发货订单可以删除' })
      return
    }

    await query('DELETE FROM order_collaborators WHERE order_id = $1', [order.id])
    await query('DELETE FROM orders WHERE id = $1', [order.id])
    res.json({ success: true })
  } catch (err: any) {
    console.error('[enterprise] delete order error:', err.message)
    res.status(500).json({ error: '删除订单失败' })
  }
})

router.post('/orders/:orderId/dispatch', authMiddleware, requireTier('team', 'pro'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { serialNumber, trackingNumber } = req.body
    const order = await findEnterpriseOrder(user.userId, req.params.orderId)

    if (!order) {
      res.status(404).json({ error: '未找到企业订单' })
      return
    }
    if (order.status !== 'pending') {
      res.status(400).json({ error: '该订单已经不是待发货状态' })
      return
    }
    if (!serialNumber || !String(serialNumber).trim() || !trackingNumber || !String(trackingNumber).trim()) {
      res.status(400).json({ error: '请填写设备序列号和快递单号' })
      return
    }

    const device = await findEnterpriseDeviceBySerial(user.userId, String(serialNumber).trim())
    if (!device || device.status !== 'idle') {
      res.status(400).json({ error: '该序列号设备不可用，请刷新后重试' })
      return
    }

    const dispatchDate = getTodayStr()

    await query(
      `UPDATE devices
       SET status = 'renting',
           current_order_id = $2,
           synced_at = NOW()
       WHERE id = $1`,
      [device.id, order.id]
    )

    const orderUpdateResult = await query(
      `UPDATE orders
       SET serial_number = $1,
           tracking_number = $2,
           dispatch_date = $3,
           status = 'dispatched',
           feishu_sync_status = 'pending',
           feishu_sync_error = '',
           synced_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [String(serialNumber).trim(), String(trackingNumber).trim(), dispatchDate, order.id]
    )

    let updatedOrder = {
      ...orderUpdateResult.rows[0],
      owner_email: order.owner_email,
      subscription_tier: order.subscription_tier,
      subscription_expires: order.subscription_expires,
      owner_created_at: order.owner_created_at
    }

    updatedOrder = await syncEnterpriseOrderFeishu(updatedOrder)

    res.json({
      success: true,
      message: '企业订单已发货',
      order: rowToOrder(updatedOrder)
    })
  } catch (err: any) {
    console.error('[enterprise] dispatch error:', err.message)
    res.status(500).json({ error: '企业订单发货失败' })
  }
})

router.post('/orders/:orderId/dispatch-with-new-device', authMiddleware, requireTier('team', 'pro'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { serialNumber, trackingNumber } = req.body
    const order = await findEnterpriseOrder(user.userId, req.params.orderId)

    if (!order) {
      res.status(404).json({ error: '未找到企业订单' })
      return
    }
    if (order.status !== 'pending') {
      res.status(400).json({ error: '该订单已经不是待发货状态' })
      return
    }

    const normalizedSerialNumber = String(serialNumber || '').trim()
    const normalizedTrackingNumber = String(trackingNumber || '').trim()
    if (!normalizedSerialNumber || !normalizedTrackingNumber) {
      res.status(400).json({ error: '请填写设备序列号和快递单号' })
      return
    }

    const existingDevice = await findEnterpriseDeviceBySerial(user.userId, normalizedSerialNumber)
    if (existingDevice) {
      if (existingDevice.status === 'idle') {
        res.status(400).json({ error: '该序列号已经在库存中，请直接确认发货' })
        return
      }

      res.status(400).json({ error: '该序列号设备已存在且当前不可用' })
      return
    }

    const context = await getEnterpriseContext(user.userId)
    if (!context) {
      res.status(404).json({ error: '你未加入任何企业' })
      return
    }

    const dispatchDate = getTodayStr()

    await query(
      `INSERT INTO devices (id, user_id, serial_number, device_id, status, current_order_id, created_at)
       VALUES ($1, $2, $3, $4, 'renting', $5, $6)`,
      [
        generateEntityId('dev'),
        context.ownerId,
        normalizedSerialNumber,
        order.device_id || '标准',
        order.id,
        dispatchDate
      ]
    )

    const orderUpdateResult = await query(
      `UPDATE orders
       SET serial_number = $1,
           tracking_number = $2,
           dispatch_date = $3,
           status = 'dispatched',
           feishu_sync_status = 'pending',
           feishu_sync_error = '',
           synced_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [normalizedSerialNumber, normalizedTrackingNumber, dispatchDate, order.id]
    )

    let updatedOrder = {
      ...orderUpdateResult.rows[0],
      owner_email: order.owner_email,
      subscription_tier: order.subscription_tier,
      subscription_expires: order.subscription_expires,
      owner_created_at: order.owner_created_at
    }

    updatedOrder = await syncEnterpriseOrderFeishu(updatedOrder)

    res.json({
      success: true,
      message: '企业订单已入库并发货',
      order: rowToOrder(updatedOrder)
    })
  } catch (err: any) {
    console.error('[enterprise] dispatch-with-new-device error:', err.message)
    res.status(500).json({ error: '企业订单入库并发货失败' })
  }
})

router.post('/orders/:orderId/return', authMiddleware, requireTier('team', 'pro'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const order = await findEnterpriseOrder(user.userId, req.params.orderId)

    if (!order) {
      res.status(404).json({ error: '未找到企业订单' })
      return
    }
    if (order.status !== 'dispatched') {
      res.status(400).json({ error: '订单未发货，无法归还' })
      return
    }

    const context = await getEnterpriseContext(user.userId)
    if (!context) {
      res.status(404).json({ error: '你未加入任何企业' })
      return
    }

    const deviceResult = await query(
      `SELECT id
       FROM devices
       WHERE user_id = $1
         AND (current_order_id = $2 OR serial_number = $3)
       LIMIT 1`,
      [context.ownerId, order.id, order.serial_number || '']
    )

    if (deviceResult.rows.length > 0) {
      await query(
        `UPDATE devices
         SET status = 'idle',
             current_order_id = '',
             synced_at = NOW()
         WHERE id = $1`,
        [deviceResult.rows[0].id]
      )
    }

    const orderUpdateResult = await query(
      `UPDATE orders
       SET return_date = $1,
           status = 'returned',
           feishu_sync_status = 'pending',
           feishu_sync_error = '',
           synced_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [getTodayStr(), order.id]
    )

    let updatedOrder = {
      ...orderUpdateResult.rows[0],
      owner_email: order.owner_email,
      subscription_tier: order.subscription_tier,
      subscription_expires: order.subscription_expires,
      owner_created_at: order.owner_created_at
    }

    updatedOrder = await syncEnterpriseOrderFeishu(updatedOrder)

    res.json({
      success: true,
      order: rowToOrder(updatedOrder)
    })
  } catch (err: any) {
    console.error('[enterprise] return error:', err.message)
    res.status(500).json({ error: '企业订单归还失败' })
  }
})

router.post('/orders/:orderId/forward', authMiddleware, requireTier('team', 'pro'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const { targetOrderId, trackingNumber } = req.body
    const sourceOrder = await findEnterpriseOrder(user.userId, req.params.orderId)
    const targetOrder = await findEnterpriseOrder(user.userId, String(targetOrderId || ''))

    if (!sourceOrder) {
      res.status(404).json({ error: '未找到转出订单' })
      return
    }
    if (!targetOrder) {
      res.status(404).json({ error: '未找到转寄目标订单' })
      return
    }
    if (sourceOrder.status !== 'dispatched') {
      res.status(400).json({ error: '转出订单未发货，无法转寄' })
      return
    }
    if (targetOrder.status !== 'pending') {
      res.status(400).json({ error: '目标订单必须是待发货状态' })
      return
    }
    if ((sourceOrder.device_id || '') !== (targetOrder.device_id || '')) {
      res.status(400).json({ error: '仅支持同型号订单之间转寄' })
      return
    }
    if (!trackingNumber || !String(trackingNumber).trim()) {
      res.status(400).json({ error: '请填写转寄快递单号' })
      return
    }

    const context = await getEnterpriseContext(user.userId)
    if (!context) {
      res.status(404).json({ error: '你未加入任何企业' })
      return
    }

    const deviceResult = await query(
      `SELECT id
       FROM devices
       WHERE user_id = $1
         AND (current_order_id = $2 OR serial_number = $3)
       LIMIT 1`,
      [context.ownerId, sourceOrder.id, sourceOrder.serial_number || '']
    )

    const today = getTodayStr()
    const tracking = String(trackingNumber).trim()

    const sourceUpdateResult = await query(
      `UPDATE orders
       SET forwarded_to_order_id = $1,
           forward_tracking = $2,
           return_date = $3,
           status = 'returned',
           feishu_sync_status = 'pending',
           feishu_sync_error = '',
           synced_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [targetOrder.id, tracking, today, sourceOrder.id]
    )

    const targetUpdateResult = await query(
      `UPDATE orders
       SET serial_number = $1,
           tracking_number = $2,
           dispatch_date = $3,
           status = 'dispatched',
           forwarded_from_order_id = $4,
           feishu_sync_status = 'pending',
           feishu_sync_error = '',
           synced_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [sourceOrder.serial_number || '', tracking, today, sourceOrder.id, targetOrder.id]
    )

    if (deviceResult.rows.length > 0) {
      await query(
        `UPDATE devices
         SET current_order_id = $2,
             status = 'renting',
             synced_at = NOW()
         WHERE id = $1`,
        [deviceResult.rows[0].id, targetOrder.id]
      )
    }

    const sourceWithOwner = await syncEnterpriseOrderFeishu({
      ...sourceUpdateResult.rows[0],
      owner_email: sourceOrder.owner_email,
      subscription_tier: sourceOrder.subscription_tier,
      subscription_expires: sourceOrder.subscription_expires,
      owner_created_at: sourceOrder.owner_created_at
    })

    const targetWithOwner = await syncEnterpriseOrderFeishu({
      ...targetUpdateResult.rows[0],
      owner_email: targetOrder.owner_email,
      subscription_tier: targetOrder.subscription_tier,
      subscription_expires: targetOrder.subscription_expires,
      owner_created_at: targetOrder.owner_created_at
    })

    res.json({
      success: true,
      message: `已将设备从「${sourceWithOwner.customer_name || sourceWithOwner.customerName || sourceOrder.customer_name}」转寄给「${targetWithOwner.customer_name || targetWithOwner.customerName || targetOrder.customer_name}」`
    })
  } catch (err: any) {
    console.error('[enterprise] forward error:', err.message)
    res.status(500).json({ error: '企业订单转寄失败' })
  }
})

router.delete('/devices/:deviceId', authMiddleware, requireTier('team', 'pro'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const device = await findEnterpriseDeviceById(user.userId, req.params.deviceId)
    if (!device) {
      res.status(404).json({ error: '未找到企业设备' })
      return
    }
    if (device.status !== 'idle') {
      res.status(400).json({ error: '只有空闲设备可以删除' })
      return
    }

    await query('DELETE FROM devices WHERE id = $1', [device.id])
    res.json({ success: true })
  } catch (err: any) {
    console.error('[enterprise] delete device error:', err.message)
    res.status(500).json({ error: '删除设备失败' })
  }
})

export default router
