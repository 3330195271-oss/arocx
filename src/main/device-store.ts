import { dialog, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import * as XLSX from 'xlsx'
import type { Device, Order, InventoryStats, DailyStats } from '../types/customer'
import type { Customer } from '../types/customer'
import { getAppDataDir } from './app-data-dir'

// ---- helpers ----

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function getTodayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getDataDir(): string {
  const dir = getAppDataDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

let activeStorageScope = 'default'

function sanitizeScope(scope: string): string {
  return scope.replace(/[^a-zA-Z0-9_-]/g, '_') || 'default'
}

function scopedFile(baseName: 'devices' | 'orders'): string {
  return join(getDataDir(), `${baseName}.${sanitizeScope(activeStorageScope)}.json`)
}

const LEGACY_DEVICES_FILE = () => join(getDataDir(), 'devices.json')
const LEGACY_ORDERS_FILE = () => join(getDataDir(), 'orders.json')
const DEVICES_FILE = () => scopedFile('devices')
const ORDERS_FILE = () => scopedFile('orders')

function migrateLegacyIfNeeded(scope: string): void {
  const sanitized = sanitizeScope(scope)
  const scopedDevices = join(getDataDir(), `devices.${sanitized}.json`)
  const scopedOrders = join(getDataDir(), `orders.${sanitized}.json`)

  const otherScopedFilesExist =
    existsSync(scopedDevices) ||
    existsSync(scopedOrders) ||
    existsSync(join(getDataDir(), 'devices.default.json')) ||
    existsSync(join(getDataDir(), 'orders.default.json'))

  if (!otherScopedFilesExist) {
    if (!existsSync(scopedDevices) && existsSync(LEGACY_DEVICES_FILE())) {
      writeFileSync(scopedDevices, readFileSync(LEGACY_DEVICES_FILE()))
    }
    if (!existsSync(scopedOrders) && existsSync(LEGACY_ORDERS_FILE())) {
      writeFileSync(scopedOrders, readFileSync(LEGACY_ORDERS_FILE()))
    }
  }
}

export function setActiveStorageScope(scope: string): void {
  const sanitized = sanitizeScope(scope)
  migrateLegacyIfNeeded(sanitized)
  activeStorageScope = sanitized
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    if (!existsSync(filePath)) return fallback
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T
  } catch {
    return fallback
  }
}

function writeJson(filePath: string, data: unknown): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

function markOrderForFeishuSync(order: Order): void {
  order.feishuSyncStatus = 'pending'
  order.feishuSyncError = ''
}

// ---- Device operations ----

export function loadDevices(): Device[] {
  return readJson<Device[]>(DEVICES_FILE(), [])
}

export function saveDevices(devices: Device[]): void {
  writeJson(DEVICES_FILE(), devices)
}

export function replaceDevices(devices: Device[]): void {
  saveDevices(devices)
}

export function addDevice(serialNumber: string, deviceId: string): Device {
  const devices = loadDevices()
  const device: Device = {
    id: generateId('dev'),
    serialNumber: serialNumber.trim(),
    deviceId: deviceId.trim(),
    status: 'idle',
    createdAt: getTodayStr()
  }
  devices.push(device)
  saveDevices(devices)
  return device
}

export function deleteDevice(deviceId: string): boolean {
  const devices = loadDevices()
  const device = devices.find(d => d.id === deviceId)
  if (!device) return false
  if (device.status === 'renting') return false // can't delete renting devices
  const filtered = devices.filter(d => d.id !== deviceId)
  saveDevices(filtered)
  return true
}

export function getDevicesByStatus(status?: Device['status']): Device[] {
  const devices = loadDevices()
  if (!status) return devices
  return devices.filter(d => d.status === status)
}

export function getInventoryStats(): InventoryStats {
  const devices = loadDevices()
  const today = getTodayStr()
  const orders = loadOrders()

  const total = devices.length
  const idle = devices.filter(d => d.status === 'idle').length
  const renting = devices.filter(d => d.status === 'renting').length
  const returnedToday = orders.filter(o => o.returnDate === today).length

  return { total, idle, renting, returnedToday }
}

// ---- Order operations ----

export function loadOrders(): Order[] {
  return readJson<Order[]>(ORDERS_FILE(), [])
}

export function saveOrders(orders: Order[]): void {
  writeJson(ORDERS_FILE(), orders)
}

export function replaceOrders(orders: Order[]): void {
  saveOrders(orders)
}

export function deleteOrder(orderId: string): boolean {
  const orders = loadOrders()
  const order = orders.find(o => o.id === orderId)
  if (!order) return false
  if (order.status !== 'pending') {
    throw new Error('只有待发货订单可以删除')
  }

  saveOrders(orders.filter(o => o.id !== orderId))
  return true
}

export function createOrder(
  customerName: string,
  customerPhone: string,
  customerAddress: string,
  deviceId: string,
  shipmentDate = '',
  rentalStart = '',
  rentalEnd = ''
): Order {
  const orders = loadOrders()
  const order: Order = {
    id: generateId('ord'),
    customerName: customerName.trim(),
    customerPhone: customerPhone.trim(),
    customerAddress: customerAddress.trim(),
    platform: '',
    csRep: '',
    remarks: '',
    deviceId: deviceId.trim(),
    serialNumber: '',
    trackingNumber: '',
    shipmentDate: shipmentDate.trim(),
    rentalStart: rentalStart.trim(),
    rentalEnd: rentalEnd.trim(),
    dispatchDate: '',
    status: 'pending',
    feishuSyncStatus: 'pending',
    feishuSyncError: ''
  }
  orders.push(order)
  saveOrders(orders)
  return order
}

export function createFullOrder(data: {
  customerName: string
  customerPhone: string
  customerAddress: string
  deviceId: string
  platform?: string
  csRep?: string
  remarks?: string
  shipmentDate?: string
  rentalStart?: string
  rentalEnd?: string
}): Order {
  const orders = loadOrders()
  const order: Order = {
    id: generateId('ord'),
    customerName: data.customerName.trim(),
    customerPhone: data.customerPhone.trim(),
    customerAddress: data.customerAddress.trim(),
    deviceId: data.deviceId.trim(),
    platform: data.platform || '',
    csRep: data.csRep || '',
    remarks: data.remarks || '',
    serialNumber: '',
    trackingNumber: '',
    shipmentDate: data.shipmentDate || '',
    rentalStart: data.rentalStart || '',
    rentalEnd: data.rentalEnd || '',
    dispatchDate: '',
    status: 'pending',
    feishuSyncStatus: 'pending',
    feishuSyncError: ''
  }
  orders.push(order)
  saveOrders(orders)
  return order
}

export function dispatchOrder(orderId: string, serialNumber: string, trackingNumber: string): Order {
  const orders = loadOrders()
  const devices = loadDevices()

  const order = orders.find(o => o.id === orderId)
  if (!order) throw new Error('订单不存在')

  const device = devices.find(d => d.serialNumber === serialNumber && d.status === 'idle')
  if (!device) throw new Error('该序列号设备不可用')

  // Update device status
  device.status = 'renting'
  device.currentOrderId = orderId
  saveDevices(devices)

  // Update order
  order.serialNumber = serialNumber
  order.trackingNumber = trackingNumber
  order.dispatchDate = getTodayStr()
  order.status = 'dispatched'
  markOrderForFeishuSync(order)
  saveOrders(orders)

  return order
}

export function returnOrder(orderId: string): Order {
  const orders = loadOrders()
  const devices = loadDevices()

  const order = orders.find(o => o.id === orderId)
  if (!order) throw new Error('订单不存在')
  if (order.status !== 'dispatched') throw new Error('订单未发货，无法归还')

  // Update device status back to idle — match by currentOrderId or serialNumber
  const device = devices.find(d =>
    d.currentOrderId === orderId || d.serialNumber === order.serialNumber
  )
  if (device) {
    device.status = 'idle'
    device.currentOrderId = undefined
    saveDevices(devices)
  } else {
    console.log(`[device-store] Warning: no device found for order ${orderId}, serial: ${order.serialNumber}`)
  }

  // Update order
  order.returnDate = getTodayStr()
  order.status = 'returned'
  markOrderForFeishuSync(order)
  saveOrders(orders)

  return order
}

export function forwardOrder(orderId: string, targetOrderId: string, trackingNumber: string): Order {
  const orders = loadOrders()
  const devices = loadDevices()

  const sourceOrder = orders.find(o => o.id === orderId)
  if (!sourceOrder) throw new Error('订单不存在')
  if (sourceOrder.status !== 'dispatched') throw new Error('订单未发货，无法转寄')

  const targetOrder = orders.find(o => o.id === targetOrderId)
  if (!targetOrder) throw new Error('目标订单不存在')

  // Source order: marked as returned (forwarded to next customer)
  sourceOrder.forwardedToOrderId = targetOrderId
  sourceOrder.forwardTracking = trackingNumber
  sourceOrder.returnDate = getTodayStr()
  sourceOrder.status = 'returned'
  markOrderForFeishuSync(sourceOrder)

  // Target order: dispatch with same device, new tracking
  targetOrder.serialNumber = sourceOrder.serialNumber
  targetOrder.trackingNumber = trackingNumber
  targetOrder.dispatchDate = getTodayStr()
  targetOrder.status = 'dispatched'
  targetOrder.forwardedFromOrderId = orderId
  markOrderForFeishuSync(targetOrder)

  // Update device: assign to target order, stay renting
  const device = devices.find(d =>
    d.currentOrderId === orderId || d.serialNumber === sourceOrder.serialNumber
  )
  if (device) {
    device.currentOrderId = targetOrderId
    device.status = 'renting'
    saveDevices(devices)
  }

  saveOrders(orders)
  return sourceOrder
}

// Forward from a pending source: dispatch first, then forward to target
export function dispatchAndForward(sourceOrderId: string, targetOrderId: string, serialNumber: string, trackingNumber: string): Order {
  // First dispatch the source
  dispatchOrder(sourceOrderId, serialNumber, trackingNumber)
  // Then forward to target
  return forwardOrder(sourceOrderId, targetOrderId, trackingNumber)
}

export function getRentingOrders(): Array<Order & { deviceSerial?: string }> {
  const orders = loadOrders()
  const devices = loadDevices()
  return orders
    .filter(o => o.status === 'dispatched')
    .map(o => {
      const device = devices.find(d => d.currentOrderId === o.id || d.serialNumber === o.serialNumber)
      return { ...o, deviceSerial: device?.serialNumber || o.serialNumber }
    })
}

export function getTodayOrders(): Order[] {
  const today = getTodayStr()
  const orders = loadOrders()
  return orders.filter(o => {
    // Orders created today (pending) or dispatched today or returned today
    if (o.dispatchDate === today) return true
    if (o.returnDate === today) return true
    if (o.status === 'pending') return true // show all pending regardless
    return false
  })
}

export function getDailyStats(): DailyStats {
  const today = getTodayStr()
  const orders = loadOrders()
  const devices = loadDevices()

  const dispatchCount = orders.filter(o => o.dispatchDate === today).length
  const returnCount = orders.filter(o => o.returnDate === today).length
  const idleStock = devices.filter(d => d.status === 'idle').length

  return { dispatchCount, returnCount, idleStock }
}

export function importOrdersFromCustomers(customers: Customer[]): number {
  const existingOrders = loadOrders()
  let imported = 0
  let skippedDup = 0

  // Build dedup set: name+phone+shipmentDate+rentalEnd keys from existing orders
  // Same customer can have multiple orders on different dates
  const existingKeys = new Set(
    existingOrders.map(o => `${o.customerName}|${o.customerPhone}|${o.shipmentDate}|${o.rentalEnd}`)
  )

  console.log(`[device-store] Total customers: ${customers.length}`)
  console.log(`[device-store] Existing pending orders: ${existingOrders.filter(o => o.status === 'pending').length}`)

  for (const cust of customers) {
    // Dedup: same name + phone + shipmentDate + rentalEnd already exists
    const key = `${cust.name}|${cust.phone}|${cust.shipmentDate}|${cust.rentalEnd}`
    if (existingKeys.has(key)) {
      skippedDup++
      continue
    }
    existingKeys.add(key)

    const order: Order = {
      id: generateId('ord'),
      customerName: cust.name,
      customerPhone: cust.phone,
      customerAddress: cust.address,
      platform: cust.platform || '',
      csRep: cust.csRep || '',
      remarks: cust.remarks || '',
      deviceId: cust.deviceId,
      serialNumber: '',
      trackingNumber: '',
      shipmentDate: cust.shipmentDate,
      rentalStart: cust.rentalStart,
      rentalEnd: cust.rentalEnd,
      dispatchDate: '',
      status: 'pending',
      feishuSyncStatus: 'pending',
      feishuSyncError: ''
    }
    existingOrders.push(order)
    imported++
  }

  console.log(`[device-store] Imported: ${imported}, skipped (dup): ${skippedDup}`)

  if (imported > 0) {
    saveOrders(existingOrders)
  }
  return imported
}

// ---- Device import from Excel ----

export async function importDevicesFromExcel(): Promise<{ imported: number; errors: string[] }> {
  const window = BrowserWindow.getFocusedWindow()
  if (!window) return { imported: 0, errors: ['无法获取当前窗口'] }

  const result = await dialog.showOpenDialog(window, {
    title: '选择设备库存表格',
    filters: [{ name: 'Excel 文件', extensions: ['xlsx', 'xls'] }],
    properties: ['openFile']
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { imported: 0, errors: [] }
  }

  const filePath = result.filePaths[0]
  const errors: string[] = []

  try {
    const buf = readFileSync(filePath)
    const workbook = XLSX.read(buf, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) return { imported: 0, errors: ['表格中没有工作表'] }

    const sheet = workbook.Sheets[sheetName]
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

    if (rows.length < 2) {
      return { imported: 0, errors: ['表格中没有数据'] }
    }

    // Match columns by keyword
    const header = rows[0].map((h: string) => String(h || '').trim())
    const colMap: Record<string, number> = {}
    const fields: Record<string, string[]> = {
      serialNumber: ['序列号', 'SN', '编号', '机身号', '设备号'],
      deviceId: ['型号', '设备型号', '机型', '类型', '规格']
    }

    for (let i = 0; i < header.length; i++) {
      for (const [field, keys] of Object.entries(fields)) {
        if (keys.some(k => header[i].includes(k))) {
          colMap[field] = i
          break
        }
      }
    }

    if (!('serialNumber' in colMap)) {
      return { imported: 0, errors: ['未找到序列号列，请确保表格包含"序列号"或"SN"列'] }
    }

    const existingDevices = loadDevices()
    const existingSerials = new Set(existingDevices.map(d => d.serialNumber))
    let imported = 0

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      const serialNumber = String(row[colMap.serialNumber] || '').trim()
      const deviceId = String(row[colMap.deviceId] || '').trim()

      if (!serialNumber) continue

      // Skip duplicates
      if (existingSerials.has(serialNumber)) {
        errors.push(`第${i + 1}行: 序列号 "${serialNumber}" 已存在，跳过`)
        continue
      }

      const device: Device = {
        id: generateId('dev'),
        serialNumber,
        deviceId: deviceId || '标准',
        status: 'idle',
        createdAt: getTodayStr()
      }
      existingDevices.push(device)
      existingSerials.add(serialNumber)
      imported++
    }

    if (imported > 0) {
      saveDevices(existingDevices)
    }

    return { imported, errors }
  } catch (err: any) {
    return { imported: 0, errors: [`读取失败: ${err.message}`] }
  }
}
