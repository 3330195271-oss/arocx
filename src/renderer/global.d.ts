import type { AppData, Device, Order, InventoryStats, DailyStats } from './types/customer'
import type { ClientPlatformInfo } from './services/api-client'

declare global {
  interface Window {
    electronAPI: {
      minimize: () => void
      maximize: () => void
      close: () => void
      isMaximized: () => Promise<boolean>
      fetchCustomerData: () => Promise<AppData>
      getSavePath: () => Promise<string>
      setActiveStorageScope: (scope: string) => Promise<boolean>
      openSharedLink: () => void

      // Device management
      addDevice: (serialNumber: string, deviceId: string) => Promise<Device>
      getDevices: (status?: string) => Promise<Device[]>
      getInventoryStats: () => Promise<InventoryStats>

      // Order management
      createOrder: (
        name: string,
        phone: string,
        address: string,
        deviceId: string,
        shipmentDate?: string,
        rentalStart?: string,
        rentalEnd?: string
      ) => Promise<Order>
      getTodayOrders: () => Promise<Order[]>
      getAllOrders: () => Promise<Order[]>
      dispatchOrder: (orderId: string, serialNumber: string, trackingNumber: string) => Promise<Order>
      dispatchOrderWithNewDevice: (orderId: string, serialNumber: string, trackingNumber: string) => Promise<Order>
      returnOrder: (orderId: string) => Promise<Order>
      deleteOrder: (orderId: string) => Promise<boolean>
      forwardOrder: (orderId: string, targetOrderId: string, trackingNumber: string) => Promise<Order>
      dispatchAndForward: (sourceOrderId: string, targetOrderId: string, serialNumber: string, trackingNumber: string) => Promise<Order>
      getDailyStats: () => Promise<DailyStats>

      // Device import
      importDevicesFromExcel: () => Promise<{ imported: number; errors: string[] }>
      getRentingOrders: () => Promise<(Order & { deviceSerial?: string })[]>
      deleteDevice: (deviceId: string) => Promise<boolean>
      openDataFolder: () => void
      getAppVersion: () => Promise<string>
      getPlatformInfo: () => Promise<ClientPlatformInfo>
      getClientDeviceIdentity: () => Promise<{ deviceId: string; deviceName: string }>
      openExternalUrl: (url: string) => Promise<boolean>
      downloadAndInstallUpdate: (downloadUrl: string) => Promise<{ success: boolean; message: string; filePath?: string }>
      replaceLocalOrders: (orders: Order[]) => Promise<boolean>
      replaceLocalDevices: (devices: Device[]) => Promise<boolean>

      // Screenshot OCR
      extractOrderFromImage: (base64Image: string) => Promise<{
        name: string; phone: string; address: string; deviceId: string
        shipmentDate: string; rentalStart: string; rentalEnd: string
        platform: string; csRep: string; remarks: string
      }>

      createFullOrder: (data: {
        customerName: string; customerPhone: string; customerAddress: string; deviceId: string
        platform?: string; csRep?: string; remarks?: string
        shipmentDate?: string; rentalStart?: string; rentalEnd?: string
      }) => Promise<Order>

      // WeCom config
      getWecomConfig: () => Promise<{ webhookUrl: string; enabled: boolean; channelType?: 'wecom' | 'platform'; channelName?: string }>
      saveWecomConfig: (config: { webhookUrl: string; enabled: boolean; channelType?: 'wecom' | 'platform'; channelName?: string }) => Promise<void>
      getNotificationSummary: () => Promise<{
        todayPendingShipmentCount: number
        expiringSoonCount: number
        overdueCount: number
        totalInventory: number
        idleInventory: number
        rentingInventory: number
      }>
      sendNotificationSummary: () => Promise<{
        success: boolean
        summary: {
          todayPendingShipmentCount: number
          expiringSoonCount: number
          overdueCount: number
          totalInventory: number
          idleInventory: number
          rentingInventory: number
        }
      }>

      importExcelFromDialog: () => Promise<AppData>
      fetchForwardingFromOrders: () => Promise<AppData>
    }
  }
}

export {}
