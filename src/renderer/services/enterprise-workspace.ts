import type { Device, Order } from '../types/customer'
import { getEnterpriseDevices, getEnterpriseOrders, getMyEnterprise, getUser } from './api-client'

export type WorkspaceOrder = Order & {
  ownerEmail?: string
  feishuRecordId?: string
  feishuSyncStatus?: string
  feishuSyncError?: string
  feishuSyncedAt?: string
}
export type WorkspaceDevice = Device & { ownerEmail?: string }

export type EnterpriseWorkspaceInfo = {
  enabled: boolean
  enterpriseId: number | null
  enterpriseName: string
}

export async function getEnterpriseWorkspaceInfo(): Promise<EnterpriseWorkspaceInfo> {
  const user = getUser()
  if (!user || user.tier === 'free') {
    return { enabled: false, enterpriseId: null, enterpriseName: '' }
  }

  try {
    const data = await getMyEnterprise()
    const enterprise = data.enterprise
    if (!enterprise) {
      return { enabled: false, enterpriseId: null, enterpriseName: '' }
    }

    return {
      enabled: true,
      enterpriseId: enterprise.id,
      enterpriseName: enterprise.name
    }
  } catch {
    return { enabled: false, enterpriseId: null, enterpriseName: '' }
  }
}

export function normalizeEnterpriseOrder(record: any): WorkspaceOrder {
  return {
    id: record.id,
    customerName: record.customerName || record.customer_name || '',
    customerPhone: record.customerPhone || record.customer_phone || '',
    customerAddress: record.customerAddress || record.customer_address || '',
    platform: record.platform || '',
    csRep: record.csRep || record.cs_rep || '',
    remarks: record.remarks || '',
    deviceId: record.deviceId || record.device_id || '',
    serialNumber: record.serialNumber || record.serial_number || '',
    trackingNumber: record.trackingNumber || record.tracking_number || '',
    shipmentDate: record.shipmentDate || record.shipment_date || '',
    rentalStart: record.rentalStart || record.rental_start || '',
    rentalEnd: record.rentalEnd || record.rental_end || '',
    dispatchDate: record.dispatchDate || record.dispatch_date || '',
    returnDate: record.returnDate || record.return_date || '',
    status: record.status || 'pending',
    forwardedFromOrderId: record.forwardedFromOrderId || record.forwarded_from_order_id || '',
    forwardedToOrderId: record.forwardedToOrderId || record.forwarded_to_order_id || '',
    forwardTracking: record.forwardTracking || record.forward_tracking || '',
    feishuRecordId: record.feishuRecordId || record.feishu_record_id || '',
    feishuSyncStatus: record.feishuSyncStatus || record.feishu_sync_status || '',
    feishuSyncError: record.feishuSyncError || record.feishu_sync_error || '',
    feishuSyncedAt: record.feishuSyncedAt || record.feishu_synced_at || '',
    ownerEmail: record.ownerEmail || record.owner_email || ''
  }
}

export function normalizeEnterpriseDevice(record: any): WorkspaceDevice {
  return {
    id: record.id,
    serialNumber: record.serialNumber || record.serial_number || '',
    deviceId: record.deviceId || record.device_id || '',
    status: record.status || 'idle',
    currentOrderId: record.currentOrderId || record.current_order_id || undefined,
    createdAt: record.createdAt || record.created_at || '',
    ownerEmail: record.ownerEmail || record.owner_email || ''
  }
}

export async function loadEnterpriseOrders(): Promise<WorkspaceOrder[]> {
  const data = await getEnterpriseOrders()
  return (data.orders || []).map(normalizeEnterpriseOrder)
}

export async function loadEnterpriseDevices(): Promise<WorkspaceDevice[]> {
  const data = await getEnterpriseDevices()
  return (data.devices || []).map(normalizeEnterpriseDevice)
}
