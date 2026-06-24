import { Router, Request, Response } from 'express'
import { query } from '../db'
import { authMiddleware } from '../middleware/auth'
import type { AuthUser } from '../middleware/auth'
import { syncOrderToFeishu } from '../feishu'

const router = Router()
router.use(authMiddleware)

// ---- Orders ----

// Pull all orders from cloud
router.get('/orders', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser
    const result = await query(
      'SELECT * FROM orders WHERE user_id = $1 ORDER BY synced_at DESC',
      [user.userId]
    )
    const orders = result.rows.map(rowToOrder)
    res.json(orders)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Push orders to cloud (replace snapshot)
router.post('/orders', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser
    const { orders } = req.body
    if (!Array.isArray(orders)) {
      res.status(400).json({ error: 'orders 必须是数组' })
      return
    }

    let upserted = 0
    const submittedIds: string[] = []
    for (const o of orders) {
      const normalizedOrder = {
        id: o.id,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        customerAddress: o.customerAddress,
        platform: o.platform || '',
        csRep: o.csRep || '',
        remarks: o.remarks || '',
        deviceId: o.deviceId,
        serialNumber: o.serialNumber || '',
        trackingNumber: o.trackingNumber || '',
        shipmentDate: o.shipmentDate || '',
        rentalStart: o.rentalStart || '',
        rentalEnd: o.rentalEnd || '',
        dispatchDate: o.dispatchDate || '',
        returnDate: o.returnDate || '',
        status: o.status || 'pending',
        forwardedFromOrderId: o.forwardedFromOrderId || '',
        forwardedToOrderId: o.forwardedToOrderId || '',
        forwardTracking: o.forwardTracking || '',
        feishuRecordId: o.feishuRecordId || '',
        feishuSyncStatus: o.feishuSyncStatus || '',
        feishuSyncError: o.feishuSyncError || '',
        feishuSyncedAt: o.feishuSyncedAt || ''
      }

      if (normalizedOrder.id) {
        submittedIds.push(normalizedOrder.id)
      }

      await query(`
        INSERT INTO orders (
          id, user_id, customer_name, customer_phone, customer_address,
          platform, cs_rep, remarks, device_id, serial_number, tracking_number,
          shipment_date, rental_start, rental_end, dispatch_date, return_date,
          status, forwarded_from_order_id, forwarded_to_order_id, forward_tracking,
          feishu_record_id, feishu_sync_status, feishu_sync_error, feishu_synced_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
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
          feishu_record_id = EXCLUDED.feishu_record_id,
          feishu_sync_status = EXCLUDED.feishu_sync_status,
          feishu_sync_error = EXCLUDED.feishu_sync_error,
          feishu_synced_at = EXCLUDED.feishu_synced_at,
          synced_at = NOW()
      `, [
        normalizedOrder.id, user.userId, normalizedOrder.customerName, normalizedOrder.customerPhone, normalizedOrder.customerAddress,
        normalizedOrder.platform, normalizedOrder.csRep, normalizedOrder.remarks,
        normalizedOrder.deviceId, normalizedOrder.serialNumber, normalizedOrder.trackingNumber,
        normalizedOrder.shipmentDate, normalizedOrder.rentalStart, normalizedOrder.rentalEnd,
        normalizedOrder.dispatchDate, normalizedOrder.returnDate,
        normalizedOrder.status,
        normalizedOrder.forwardedFromOrderId, normalizedOrder.forwardedToOrderId, normalizedOrder.forwardTracking,
        normalizedOrder.feishuRecordId, normalizedOrder.feishuSyncStatus, normalizedOrder.feishuSyncError,
        normalizedOrder.feishuSyncedAt ? new Date(normalizedOrder.feishuSyncedAt) : null
      ])

      const shouldSyncFeishu = normalizedOrder.feishuSyncStatus === 'pending'

      if (shouldSyncFeishu) {
        const syncMeta = await syncOrderToFeishu(normalizedOrder, user)
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
              user.userId
            ]
          )
        }
      }

      upserted++
    }

    let deleted = 0
    if (submittedIds.length > 0) {
      await query(
        `DELETE FROM order_collaborators
         WHERE order_id IN (
           SELECT id FROM orders
           WHERE user_id = $1 AND NOT (id = ANY($2::varchar[]))
         )`,
        [user.userId, submittedIds]
      )
      const deleteResult = await query(
        'DELETE FROM orders WHERE user_id = $1 AND NOT (id = ANY($2::varchar[]))',
        [user.userId, submittedIds]
      )
      deleted = deleteResult.rowCount || 0
    } else {
      await query(
        'DELETE FROM order_collaborators WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)',
        [user.userId]
      )
      const deleteResult = await query('DELETE FROM orders WHERE user_id = $1', [user.userId])
      deleted = deleteResult.rowCount || 0
    }

    res.json({ upserted, deleted })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ---- Devices ----

router.get('/devices', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser
    const result = await query(
      'SELECT * FROM devices WHERE user_id = $1',
      [user.userId]
    )
    const devices = result.rows.map(rowToDevice)
    res.json(devices)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/devices', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user as AuthUser
    const { devices } = req.body
    if (!Array.isArray(devices)) {
      res.status(400).json({ error: 'devices 必须是数组' })
      return
    }

    let upserted = 0
    const submittedIds: string[] = []
    for (const d of devices) {
      if (d.id) {
        submittedIds.push(d.id)
      }
      await query(`
        INSERT INTO devices (id, user_id, serial_number, device_id, status, current_order_id, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (id) DO UPDATE SET
          serial_number = EXCLUDED.serial_number,
          device_id = EXCLUDED.device_id,
          status = EXCLUDED.status,
          current_order_id = EXCLUDED.current_order_id,
          synced_at = NOW()
      `, [d.id, user.userId, d.serialNumber, d.deviceId, d.status, d.currentOrderId || '', d.createdAt || ''])
      upserted++
    }

    let deleted = 0
    if (submittedIds.length > 0) {
      const deleteResult = await query(
        'DELETE FROM devices WHERE user_id = $1 AND NOT (id = ANY($2::varchar[]))',
        [user.userId, submittedIds]
      )
      deleted = deleteResult.rowCount || 0
    } else {
      const deleteResult = await query('DELETE FROM devices WHERE user_id = $1', [user.userId])
      deleted = deleteResult.rowCount || 0
    }

    res.json({ upserted, deleted })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ---- Helpers ----

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
    feishuRecordId: row.feishu_record_id || '',
    feishuSyncStatus: row.feishu_sync_status || '',
    feishuSyncError: row.feishu_sync_error || '',
    feishuSyncedAt: row.feishu_synced_at ? new Date(row.feishu_synced_at).toISOString() : ''
  }
}

function rowToDevice(row: any) {
  return {
    id: row.id,
    serialNumber: row.serial_number,
    deviceId: row.device_id,
    status: row.status,
    currentOrderId: row.current_order_id || undefined,
    createdAt: row.created_at
  }
}

export default router
