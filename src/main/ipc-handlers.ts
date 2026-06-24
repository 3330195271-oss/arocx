import { app, ipcMain, shell } from 'electron'
import { dirname } from 'path'
import { fetchCustomers, openSharedLink, getSavePath, readExcelFile } from './wps-service'
import { extractOrderFromImage, getMaskedApiKey, saveApiKey } from './ocr-service'
import {
  getWecomConfig,
  saveWecomConfig,
  sendDispatchNotification,
  sendForwardNotification,
  buildNotificationSummary,
  sendSummaryNotification
} from './wecom-service'
import { findExpiringCustomers, buildExpiringWithOptions, buildForwardingFromOrders } from './matcher'
import { downloadAndInstallUpdate } from './update-service'
import * as deviceStore from './device-store'
import { getClientDeviceIdentity } from './device-identity'
import type { AppData, Device, Order, InventoryStats, DailyStats } from '../types/customer'

export function registerIpcHandlers(): void {
  ipcMain.handle('import-excel-from-dialog', async (): Promise<AppData> => {
    const { dialog } = await import('electron')
    const win = require('electron').BrowserWindow.getFocusedWindow()
    if (!win) throw new Error('无法打开文件选择窗口')
    const result = await dialog.showOpenDialog(win, {
      title: '选择要导入的表格',
      filters: [{ name: 'Excel 文件', extensions: ['xlsx', 'xls'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { expiringCustomers: [], allCustomers: [], lastUpdated: '' }
    }
    const filePath = result.filePaths[0]
    const data = readExcelFile(filePath)
    if (data.error) throw new Error(data.error)
    const expiring = findExpiringCustomers(data.customers)
    const expiringWithOptions = buildExpiringWithOptions(expiring, data.customers)
    const imported = deviceStore.importOrdersFromCustomers(data.customers)
    if (imported > 0) console.log('[import-excel] Imported ' + imported + ' orders from ' + filePath)
    return {
      expiringCustomers: expiringWithOptions,
      allCustomers: data.customers,
      lastUpdated: new Date().toLocaleString('zh-CN')
    }
  })

  ipcMain.handle('fetch-customer-data', async (): Promise<AppData> => {
    const result = fetchCustomers()

    if (result.error) {
      throw new Error(result.error)
    }

    const expiring = findExpiringCustomers(result.customers)
    const expiringWithOptions = buildExpiringWithOptions(expiring, result.customers)

    // Auto-import orders from Excel data
    const imported = deviceStore.importOrdersFromCustomers(result.customers)
    if (imported > 0) {
      console.log(`[device-store] Imported ${imported} orders from Excel`)
    }

    return {
      expiringCustomers: expiringWithOptions,
      allCustomers: result.customers,
      lastUpdated: new Date().toLocaleString('zh-CN')
    }
  })

  ipcMain.handle('get-save-path', () => getSavePath())

  ipcMain.handle('set-active-storage-scope', async (_e, scope: string) => {
    deviceStore.setActiveStorageScope(scope)
    return true
  })

  ipcMain.on('open-shared-link', () => openSharedLink())

  // ---- Device management IPC ----

  ipcMain.handle('add-device', async (_e, serialNumber: string, deviceId: string): Promise<Device> => {
    return deviceStore.addDevice(serialNumber, deviceId)
  })

  ipcMain.handle('get-devices', async (_e, status?: string): Promise<Device[]> => {
    return deviceStore.getDevicesByStatus(status as Device['status'] | undefined)
  })

  ipcMain.handle('get-inventory-stats', async (): Promise<InventoryStats> => {
    return deviceStore.getInventoryStats()
  })

  // ---- Order management IPC ----

  ipcMain.handle('create-order', async (
    _e,
    name: string,
    phone: string,
    address: string,
    deviceId: string,
    shipmentDate?: string,
    rentalStart?: string,
    rentalEnd?: string
  ): Promise<Order> => {
    return deviceStore.createOrder(name, phone, address, deviceId, shipmentDate, rentalStart, rentalEnd)
  })

  ipcMain.handle('get-today-orders', async (): Promise<Order[]> => {
    return deviceStore.getTodayOrders()
  })

  ipcMain.handle('get-all-orders', async (): Promise<Order[]> => {
    return deviceStore.loadOrders()
  })

  ipcMain.handle('dispatch-order', async (_e, orderId: string, serialNumber: string, trackingNumber: string): Promise<Order> => {
    const order = deviceStore.dispatchOrder(orderId, serialNumber, trackingNumber)
    // Fire WeCom notification (async, don't block)
    sendDispatchNotification({
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      deviceModel: order.deviceId,
      serialNumber: order.serialNumber,
      trackingNumber: order.trackingNumber,
      csRep: (order as any).csRep,
      platform: (order as any).platform,
      address: order.customerAddress
    }).catch(() => {})
    return order
  })

  ipcMain.handle('return-order', async (_e, orderId: string): Promise<Order> => {
    return deviceStore.returnOrder(orderId)
  })

  ipcMain.handle('delete-order', async (_e, orderId: string): Promise<boolean> => {
    return deviceStore.deleteOrder(orderId)
  })

  ipcMain.handle('forward-order', async (_e, orderId: string, targetOrderId: string, trackingNumber: string): Promise<Order> => {
    const order = deviceStore.forwardOrder(orderId, targetOrderId, trackingNumber)
    // Fire WeCom notification (async, don't block)
    const allOrders = deviceStore.loadOrders()
    const targetOrder = allOrders.find(o => o.id === targetOrderId)
    sendForwardNotification({
      fromCustomer: order.customerName,
      toCustomer: targetOrder?.customerName || '未知',
      deviceModel: order.deviceId,
      trackingNumber,
      csRep: (order as any).csRep
    }).catch(() => {})
    return order
  })

  ipcMain.handle('dispatch-and-forward', async (_e, sourceOrderId: string, targetOrderId: string, serialNumber: string, trackingNumber: string): Promise<Order> => {
    return deviceStore.dispatchAndForward(sourceOrderId, targetOrderId, serialNumber, trackingNumber)
  })

  ipcMain.handle('get-daily-stats', async (): Promise<DailyStats> => {
    return deviceStore.getDailyStats()
  })

  ipcMain.handle('import-devices-from-excel', async () => {
    return deviceStore.importDevicesFromExcel()
  })

  ipcMain.handle('get-renting-orders', async () => {
    return deviceStore.getRentingOrders()
  })

  ipcMain.handle('delete-device', async (_e, deviceId: string): Promise<boolean> => {
    return deviceStore.deleteDevice(deviceId)
  })

  ipcMain.handle('get-api-key', async () => {
    return getMaskedApiKey()
  })

  ipcMain.handle('save-api-key', async (_e, key: string) => {
    saveApiKey(key)
    return true
  })

  ipcMain.handle('get-wecom-config', async () => {
    return getWecomConfig()
  })

  ipcMain.handle('save-wecom-config', async (_e, config: {
    webhookUrl: string
    enabled: boolean
    channelType?: 'wecom' | 'platform'
    channelName?: string
  }) => {
    saveWecomConfig(config)
    return true
  })

  ipcMain.handle('get-notification-summary', async () => {
    return buildNotificationSummary(deviceStore.loadOrders(), deviceStore.loadDevices())
  })

  ipcMain.handle('send-notification-summary', async () => {
    const summary = buildNotificationSummary(deviceStore.loadOrders(), deviceStore.loadDevices())
    const success = await sendSummaryNotification(summary)
    return { success, summary }
  })
  ipcMain.on('open-data-folder', () => {
    const filePath = getSavePath()
    const dir = dirname(filePath)
    shell.openPath(dir)
  })

  ipcMain.handle('get-app-version', async () => app.getVersion())
  ipcMain.handle('get-platform-info', async () => ({
    platform: process.platform,
    arch: process.arch
  }))
  ipcMain.handle('get-client-device-identity', async () => {
    return getClientDeviceIdentity()
  })
  ipcMain.handle('open-external-url', async (_e, url: string) => {
    await shell.openExternal(url)
    return true
  })
  ipcMain.handle('download-and-install-update', async (event, downloadUrl: string) => {
    return downloadAndInstallUpdate(downloadUrl, progress => {
      event.sender.send('update-download-progress', progress)
    })
  })

  ipcMain.handle('replace-local-orders', async (_e, orders: Order[]): Promise<boolean> => {
    deviceStore.replaceOrders(orders)
    return true
  })

  ipcMain.handle('replace-local-devices', async (_e, devices: Device[]): Promise<boolean> => {
    deviceStore.replaceDevices(devices)
    return true
  })

  // ---- Screenshot OCR ----
  ipcMain.handle('extract-order-from-image', async (_e, base64Image: string) => {
    return extractOrderFromImage(base64Image)
  })

  ipcMain.handle('create-full-order', async (_e, data: {
    customerName: string; customerPhone: string; customerAddress: string; deviceId: string
    platform?: string; csRep?: string; remarks?: string
    shipmentDate?: string; rentalStart?: string; rentalEnd?: string
  }) => {
    return deviceStore.createFullOrder(data)
  })


  // ---- Forwarding from orders (not Excel) ----
  ipcMain.handle('fetch-forwarding-from-orders', async () => {
    const orders = deviceStore.loadOrders()
    return buildForwardingFromOrders(orders)
  })
}
