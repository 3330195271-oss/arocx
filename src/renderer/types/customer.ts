export interface Customer {
  name: string
  phone: string
  address: string
  platform: string        // 平台（如：诚赁）
  csRep: string           // 客服
  remarks: string         // 备注
  shipmentDate: string   // 发货日
  rentalStart: string    // 起租日
  rentalEnd: string      // 最后一天租期
  deviceId: string
}

export interface ExpiringCustomer extends Customer {
  forwardingOptions: ForwardingOption[]
}

export interface ForwardingOption {
  customer: Customer
  matchLevel: MatchLevel
  matchReason: string
}

export type MatchLevel = 'same_city' | 'same_province' | 'adjacent_province'

export interface AddressParts {
  province: string
  city: string
  district: string
  street: string
  detail: string
}

export interface AppData {
  expiringCustomers: ExpiringCustomer[]
  allCustomers: Customer[]
  lastUpdated: string
}

export interface WpsConfig {
  clientId: string
  clientSecret: string
  shareUrl: string
}

// ========== 设备管理系统新增类型 ==========

export type DeviceStatus = 'idle' | 'renting'

export interface Device {
  id: string
  serialNumber: string
  deviceId: string
  status: DeviceStatus
  currentOrderId?: string
  createdAt: string
}

export type OrderStatus = 'pending' | 'dispatched' | 'returned'

export interface Order {
  id: string
  customerName: string
  customerPhone: string
  customerAddress: string
  platform: string        // 平台（如：诚赁）
  csRep: string           // 客服
  remarks: string         // 备注
  deviceId: string
  serialNumber: string
  trackingNumber: string
  shipmentDate?: string  // 发货日（从Excel导入时自动填充）
  rentalStart?: string   // 起租日（从Excel导入时自动填充）
  rentalEnd?: string     // 最后一天租期（从Excel导入时自动填充）
  dispatchDate: string
  returnDate?: string
  status: OrderStatus
  // 转寄相关
  forwardedFromOrderId?: string   // 从哪个订单转寄过来
  forwardedToOrderId?: string     // 转寄给了哪个订单
  forwardTracking?: string        // 转寄快递单号
}

export interface InventoryStats {
  total: number
  idle: number
  renting: number
  returnedToday: number
}

export interface DailyStats {
  dispatchCount: number
  returnCount: number
  idleStock: number
}
