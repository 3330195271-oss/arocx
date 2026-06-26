import { Router, Request, Response } from 'express'
import { authMiddleware, requireTier } from '../middleware/auth'
import type { AuthUser } from '../middleware/auth'
import { query } from '../db'
import { syncOrderToFeishu } from '../feishu'

const router = Router()

function getTodayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function rowToOrder(row: any) {
  return {
    id: row.id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerAddress: row.customer_address,
    platform: row.platform || '',
    csRep: row.cs_rep || '',
    remarks: row.remarks || '',
    deviceId: row.device_id || '',
    serialNumber: row.serial_number || '',
    trackingNumber: row.tracking_number || '',
    shipmentDate: row.shipment_date || '',
    rentalStart: row.rental_start || '',
    rentalEnd: row.rental_end || '',
    dispatchDate: row.dispatch_date || '',
    returnDate: row.return_date || '',
    status: row.status || 'pending',
    forwardedFromOrderId: row.forwarded_from_order_id || '',
    forwardedToOrderId: row.forwarded_to_order_id || '',
    forwardTracking: row.forward_tracking || '',
    friendDispatchHelperUserId: row.friend_dispatch_helper_user_id || undefined,
    friendDispatchHelperEmail: row.friend_dispatch_helper_email || '',
    feishuRecordId: row.feishu_record_id || '',
    feishuSyncStatus: row.feishu_sync_status || '',
    feishuSyncError: row.feishu_sync_error || '',
    feishuSyncedAt: row.feishu_synced_at ? new Date(row.feishu_synced_at).toISOString() : ''
  }
}

// Share an order with a friend
router.post('/orders/:orderId/share', authMiddleware, requireTier('team', 'pro'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const orderId = req.params.orderId
    const { friendId } = req.body

    if (!friendId) {
      res.status(400).json({ error: '请选择好友' })
      return
    }

    const orderCheck = await query(
      'SELECT id, status FROM orders WHERE id = $1 AND user_id = $2',
      [orderId, user.userId]
    )
    if (orderCheck.rows.length === 0) {
      res.status(404).json({ error: '订单不存在或不属于当前账号' })
      return
    }
    if (orderCheck.rows[0].status !== 'pending') {
      res.status(400).json({ error: '只支持分享待发货订单给好友代发' })
      return
    }

    // Verify friendship
    const friendCheck = await query(
      `SELECT id FROM friends WHERE status = 'accepted' AND 
       ((user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1))`,
      [user.userId, friendId]
    )
    if (friendCheck.rows.length === 0) {
      res.status(403).json({ error: '对方不是你的好友' })
      return
    }

    // Check if already shared
    const existing = await query(
      'SELECT id FROM order_collaborators WHERE order_id = $1 AND user_id = $2',
      [orderId, friendId]
    )
    if (existing.rows.length > 0) {
      res.status(409).json({ error: '已分享给该好友' })
      return
    }

    await query(
      'INSERT INTO order_collaborators (order_id, user_id, added_by) VALUES ($1, $2, $3)',
      [orderId, friendId, user.userId]
    )

    res.json({ success: true, message: '分享成功' })
  } catch (err: any) {
    console.error('[collab] share error:', err.message)
    res.status(500).json({ error: '分享失败' })
  }
})

// Get collaborators for an order
router.get('/orders/:orderId/collaborators', authMiddleware, requireTier('team', 'pro'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const orderId = req.params.orderId
    const orderCheck = await query(
      'SELECT id FROM orders WHERE id = $1 AND user_id = $2',
      [orderId, user.userId]
    )
    if (orderCheck.rows.length === 0) {
      res.status(404).json({ error: '订单不存在或不属于当前账号' })
      return
    }

    const result = await query(
      `SELECT oc.user_id, oc.added_by, oc.created_at, u.email
       FROM order_collaborators oc JOIN users u ON oc.user_id = u.id
       WHERE oc.order_id = $1`,
      [orderId]
    )
    res.json({ collaborators: result.rows })
  } catch (err: any) {
    res.status(500).json({ error: '查询失败' })
  }
})

// Get orders shared with me
router.get('/shared-with-me', authMiddleware, requireTier('team', 'pro'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const result = await query(
      `SELECT o.*, u.email as owner_email, oc.created_at as shared_at
       FROM order_collaborators oc 
       JOIN orders o ON oc.order_id = o.id
       JOIN users u ON o.user_id = u.id
       WHERE oc.user_id = $1
       ORDER BY CASE WHEN o.status = 'pending' THEN 0 ELSE 1 END, oc.created_at DESC`,
      [user.userId]
    )
    res.json({ orders: result.rows })
  } catch (err: any) {
    res.status(500).json({ error: '查询失败' })
  }
})

router.get('/shipments/assisted-by-me', authMiddleware, requireTier('team', 'pro'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const result = await query(
      `SELECT o.*, owner.email as owner_email
       FROM orders o
       JOIN users owner ON o.user_id = owner.id
       WHERE o.friend_dispatch_helper_user_id = $1
         AND owner.id <> $1
       ORDER BY o.synced_at DESC`,
      [user.userId]
    )
    res.json({ orders: result.rows })
  } catch (err: any) {
    console.error('[collab] assisted shipments error:', err.message)
    res.status(500).json({ error: '查询代发记录失败' })
  }
})

// Get dispatch options for a shared order
router.get('/orders/:orderId/dispatch-options', authMiddleware, requireTier('team', 'pro'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const orderId = req.params.orderId

    const sharedOrderResult = await query(
      `SELECT o.*, u.email as owner_email
       FROM order_collaborators oc
       JOIN orders o ON oc.order_id = o.id
       JOIN users u ON o.user_id = u.id
       WHERE oc.user_id = $1 AND o.id = $2`,
      [user.userId, orderId]
    )
    if (sharedOrderResult.rows.length === 0) {
      res.status(404).json({ error: '未找到可代发的订单' })
      return
    }

    const order = sharedOrderResult.rows[0]
    if (order.status !== 'pending') {
      res.status(400).json({ error: '该订单已经不是待发货状态' })
      return
    }

    const devicesResult = await query(
      `SELECT id, serial_number, device_id, status, current_order_id, created_at
       FROM devices
       WHERE user_id = $1 AND status = 'idle'
       ORDER BY CASE WHEN device_id = $2 THEN 0 ELSE 1 END, synced_at DESC
       LIMIT 200`,
      [order.user_id, order.device_id || '']
    )

    res.json({
      order,
      devices: devicesResult.rows
    })
  } catch (err: any) {
    console.error('[collab] dispatch options error:', err.message)
    res.status(500).json({ error: '获取代发设备失败' })
  }
})

// Dispatch a shared order on behalf of a friend
router.post('/orders/:orderId/dispatch', authMiddleware, requireTier('team', 'pro'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const orderId = req.params.orderId
    const { serialNumber, trackingNumber } = req.body

    if (!serialNumber || !String(serialNumber).trim() || !trackingNumber || !String(trackingNumber).trim()) {
      res.status(400).json({ error: '请填写设备序列号和快递单号' })
      return
    }

    const sharedOrderResult = await query(
      `SELECT o.*, u.email as owner_email, u.subscription_tier, u.subscription_expires, u.created_at as owner_created_at
       FROM order_collaborators oc
       JOIN orders o ON oc.order_id = o.id
       JOIN users u ON o.user_id = u.id
       WHERE oc.user_id = $1 AND o.id = $2`,
      [user.userId, orderId]
    )
    if (sharedOrderResult.rows.length === 0) {
      res.status(404).json({ error: '未找到可代发的订单' })
      return
    }

    const sharedOrder = sharedOrderResult.rows[0]
    if (sharedOrder.status !== 'pending') {
      res.status(400).json({ error: '该订单已经不是待发货状态' })
      return
    }

    const deviceResult = await query(
      `SELECT id, serial_number, device_id
       FROM devices
       WHERE user_id = $1 AND serial_number = $2 AND status = 'idle'
       LIMIT 1`,
      [sharedOrder.user_id, String(serialNumber).trim()]
    )
    if (deviceResult.rows.length === 0) {
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
      [deviceResult.rows[0].id, orderId]
    )

    const orderUpdateResult = await query(
      `UPDATE orders
       SET serial_number = $1,
           tracking_number = $2,
           dispatch_date = $3,
           status = 'dispatched',
           friend_dispatch_helper_user_id = $4,
           friend_dispatch_helper_email = $5,
           feishu_sync_status = 'pending',
           feishu_sync_error = '',
           synced_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        String(serialNumber).trim(),
        String(trackingNumber).trim(),
        dispatchDate,
        user.userId,
        user.email,
        orderId
      ]
    )

    let updatedOrder = orderUpdateResult.rows[0]

    const ownerUser: AuthUser = {
      userId: updatedOrder.user_id,
      email: sharedOrder.owner_email,
      tier: sharedOrder.subscription_tier || 'free',
      subscriptionExpires: sharedOrder.subscription_expires || null,
      createdAt: sharedOrder.owner_created_at || null
    }

    const syncMeta = await syncOrderToFeishu(rowToOrder(updatedOrder), ownerUser)
    if (syncMeta) {
      const feishuUpdateResult = await query(
        `UPDATE orders
         SET feishu_record_id = $2,
             feishu_sync_status = $3,
             feishu_sync_error = $4,
             feishu_synced_at = $5,
             synced_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          orderId,
          syncMeta.feishuRecordId || '',
          syncMeta.feishuSyncStatus,
          syncMeta.feishuSyncError || '',
          syncMeta.feishuSyncedAt ? new Date(syncMeta.feishuSyncedAt) : null
        ]
      )
      updatedOrder = feishuUpdateResult.rows[0]
    }

    res.json({
      success: true,
      message: `已帮 ${sharedOrder.owner_email} 完成发货`,
      order: rowToOrder(updatedOrder)
    })
  } catch (err: any) {
    console.error('[collab] dispatch error:', err.message)
    res.status(500).json({ error: '代发失败' })
  }
})

// Remove collaborator
router.delete('/orders/:orderId/share/:userId', authMiddleware, requireTier('team', 'pro'), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    const orderId = req.params.orderId
    const targetUserId = parseInt(req.params.userId)

    const orderCheck = await query(
      'SELECT id FROM orders WHERE id = $1 AND user_id = $2',
      [orderId, user.userId]
    )
    if (orderCheck.rows.length === 0) {
      res.status(404).json({ error: '订单不存在或不属于当前账号' })
      return
    }

    await query(
      'DELETE FROM order_collaborators WHERE order_id = $1 AND user_id = $2',
      [orderId, targetUserId]
    )

    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: '操作失败' })
  }
})

export default router
