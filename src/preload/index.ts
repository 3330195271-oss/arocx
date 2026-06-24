import { contextBridge, ipcRenderer } from 'electron'
import type { AppData, Device, Order, InventoryStats, DailyStats } from '../types/customer'

ipcRenderer.on('update-download-progress', (_event, progress) => {
  window.dispatchEvent(new CustomEvent('update-download-progress', { detail: progress }))
})

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  fetchCustomerData: (): Promise<AppData> => ipcRenderer.invoke('fetch-customer-data'),
  getSavePath: (): Promise<string> => ipcRenderer.invoke('get-save-path'),
  setActiveStorageScope: (scope: string): Promise<boolean> => ipcRenderer.invoke('set-active-storage-scope', scope),
  openSharedLink: () => ipcRenderer.send('open-shared-link'),

  // Device management
  addDevice: (serialNumber: string, deviceId: string): Promise<Device> =>
    ipcRenderer.invoke('add-device', serialNumber, deviceId),
  getDevices: (status?: string): Promise<Device[]> =>
    ipcRenderer.invoke('get-devices', status),
  getInventoryStats: (): Promise<InventoryStats> =>
    ipcRenderer.invoke('get-inventory-stats'),

  // Order management
  createOrder: (
    name: string,
    phone: string,
    address: string,
    deviceId: string,
    shipmentDate?: string,
    rentalStart?: string,
    rentalEnd?: string
  ): Promise<Order> =>
    ipcRenderer.invoke('create-order', name, phone, address, deviceId, shipmentDate, rentalStart, rentalEnd),
  getTodayOrders: (): Promise<Order[]> =>
    ipcRenderer.invoke('get-today-orders'),
  getAllOrders: (): Promise<Order[]> =>
    ipcRenderer.invoke('get-all-orders'),
  dispatchOrder: (orderId: string, serialNumber: string, trackingNumber: string): Promise<Order> =>
    ipcRenderer.invoke('dispatch-order', orderId, serialNumber, trackingNumber),
  returnOrder: (orderId: string): Promise<Order> =>
    ipcRenderer.invoke('return-order', orderId),
  deleteOrder: (orderId: string): Promise<boolean> =>
    ipcRenderer.invoke('delete-order', orderId),
  forwardOrder: (orderId: string, targetOrderId: string, trackingNumber: string): Promise<Order> =>
    ipcRenderer.invoke('forward-order', orderId, targetOrderId, trackingNumber),
  dispatchAndForward: (sourceOrderId: string, targetOrderId: string, serialNumber: string, trackingNumber: string): Promise<Order> =>
    ipcRenderer.invoke('dispatch-and-forward', sourceOrderId, targetOrderId, serialNumber, trackingNumber),
  getDailyStats: (): Promise<DailyStats> =>
    ipcRenderer.invoke('get-daily-stats'),

  // Device import
  importDevicesFromExcel: (): Promise<{ imported: number; errors: string[] }> =>
    ipcRenderer.invoke('import-devices-from-excel'),

  getRentingOrders: (): Promise<(Order & { deviceSerial?: string })[]> =>
    ipcRenderer.invoke('get-renting-orders'),

  deleteDevice: (deviceId: string): Promise<boolean> =>
    ipcRenderer.invoke('delete-device', deviceId),

  openDataFolder: () => ipcRenderer.send('open-data-folder'),
  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke('get-app-version'),
  getPlatformInfo: (): Promise<{ platform: string; arch: string }> =>
    ipcRenderer.invoke('get-platform-info'),
  getClientDeviceIdentity: (): Promise<{ deviceId: string; deviceName: string }> =>
    ipcRenderer.invoke('get-client-device-identity'),
  openExternalUrl: (url: string): Promise<boolean> =>
    ipcRenderer.invoke('open-external-url', url),
  downloadAndInstallUpdate: (downloadUrl: string): Promise<{ success: boolean; message: string; filePath?: string }> =>
    ipcRenderer.invoke('download-and-install-update', downloadUrl),

  replaceLocalOrders: (orders: Order[]): Promise<boolean> =>
    ipcRenderer.invoke('replace-local-orders', orders),
  replaceLocalDevices: (devices: Device[]): Promise<boolean> =>
    ipcRenderer.invoke('replace-local-devices', devices),

  // Screenshot OCR
  extractOrderFromImage: (base64Image: string): Promise<{
    name: string; phone: string; address: string; deviceId: string;
    shipmentDate: string; rentalStart: string; rentalEnd: string;
    platform: string; csRep: string; remarks: string;
  }> => ipcRenderer.invoke('extract-order-from-image', base64Image),

  createFullOrder: (data: {
    customerName: string; customerPhone: string; customerAddress: string; deviceId: string
    platform?: string; csRep?: string; remarks?: string
    shipmentDate?: string; rentalStart?: string; rentalEnd?: string
  }): Promise<Order> =>
    ipcRenderer.invoke('create-full-order', data),

  // WeCom config
  getWecomConfig: (): Promise<{ webhookUrl: string; enabled: boolean; channelType?: 'wecom' | 'platform'; channelName?: string }> =>
    ipcRenderer.invoke('get-wecom-config'),
  saveWecomConfig: (config: { webhookUrl: string; enabled: boolean; channelType?: 'wecom' | 'platform'; channelName?: string }): Promise<void> =>
    ipcRenderer.invoke('save-wecom-config', config),
  getNotificationSummary: (): Promise<{
    todayPendingShipmentCount: number
    expiringSoonCount: number
    overdueCount: number
    totalInventory: number
    idleInventory: number
    rentingInventory: number
  }> => ipcRenderer.invoke('get-notification-summary'),
  sendNotificationSummary: (): Promise<{
    success: boolean
    summary: {
      todayPendingShipmentCount: number
      expiringSoonCount: number
      overdueCount: number
      totalInventory: number
      idleInventory: number
      rentingInventory: number
    }
  }> => ipcRenderer.invoke('send-notification-summary'),

  // API Key
  getApiKey: (): Promise<string> =>
    ipcRenderer.invoke('get-api-key'),
  saveApiKey: (key: string): Promise<boolean> =>
    ipcRenderer.invoke('save-api-key', key),

  // Forwarding from orders
  importExcelFromDialog: (): Promise<import('../types/customer').AppData> =>
    ipcRenderer.invoke('import-excel-from-dialog'),

  fetchForwardingFromOrders: (): Promise<import('../types/customer').AppData> =>
    ipcRenderer.invoke('fetch-forwarding-from-orders')
})
