import type { Customer, ExpiringCustomer, ForwardingOption, MatchLevel } from '../types/customer'
import { parseAddress } from './address-parser'

// Adjacent province map
const ADJACENT: Record<string, string[]> = {
  '北京': ['河北', '天津'],
  '天津': ['北京', '河北'],
  '上海': ['江苏', '浙江'],
  '重庆': ['四川', '贵州', '湖北', '湖南', '陕西'],
  '河北': ['北京', '天津', '山西', '河南', '山东', '辽宁', '内蒙古'],
  '山西': ['河北', '河南', '陕西', '内蒙古'],
  '辽宁': ['吉林', '内蒙古', '河北'],
  '吉林': ['辽宁', '黑龙江', '内蒙古'],
  '黑龙江': ['吉林', '内蒙古'],
  '江苏': ['上海', '浙江', '安徽', '山东'],
  '浙江': ['上海', '江苏', '安徽', '福建', '江西'],
  '安徽': ['江苏', '浙江', '江西', '湖北', '河南', '山东'],
  '福建': ['浙江', '江西', '广东'],
  '江西': ['浙江', '安徽', '福建', '广东', '湖南', '湖北'],
  '山东': ['河北', '河南', '安徽', '江苏'],
  '河南': ['河北', '山西', '陕西', '湖北', '安徽', '山东'],
  '湖北': ['河南', '陕西', '重庆', '湖南', '江西', '安徽'],
  '湖南': ['湖北', '重庆', '贵州', '广西', '广东', '江西'],
  '广东': ['福建', '江西', '湖南', '广西', '海南'],
  '广西': ['广东', '湖南', '贵州', '云南'],
  '海南': ['广东'],
  '四川': ['重庆', '贵州', '云南', '西藏', '陕西', '甘肃', '青海'],
  '贵州': ['重庆', '四川', '云南', '广西', '湖南'],
  '云南': ['四川', '贵州', '广西', '西藏'],
  '西藏': ['新疆', '青海', '四川', '云南'],
  '陕西': ['山西', '河南', '湖北', '重庆', '四川', '甘肃', '宁夏', '内蒙古'],
  '甘肃': ['陕西', '四川', '青海', '新疆', '宁夏', '内蒙古'],
  '青海': ['甘肃', '四川', '西藏', '新疆'],
  '宁夏': ['陕西', '甘肃', '内蒙古'],
  '新疆': ['甘肃', '青海', '西藏'],
  '内蒙古': ['黑龙江', '吉林', '辽宁', '河北', '山西', '陕西', '宁夏', '甘肃'],
  '台湾': ['福建'],
  '香港': ['广东'],
  '澳门': ['广东']
}

export function findExpiringCustomers(allCustomers: Customer[]): Customer[] {
  const today = getTodayStr()
  return allCustomers.filter((c) => c.rentalEnd === today)
}

export function buildExpiringWithOptions(
  expiring: Customer[],
  allCustomers: Customer[]
): ExpiringCustomer[] {
  const nonExpiring = allCustomers.filter(
    (c) => !expiring.some((e) => e.name === c.name && e.phone === c.phone)
  )

  return expiring.map((customer) => {
    const options = findForwardingOptions(customer, nonExpiring)
    return { ...customer, forwardingOptions: options }
  })
}

function findForwardingOptions(
  source: Customer,
  candidates: Customer[]
): ForwardingOption[] {
  const sourceParts = parseAddress(source.address)
  const results: ForwardingOption[] = []

  for (const candidate of candidates) {
    if (candidate.deviceId !== source.deviceId) continue
    if (candidate.name === source.name && candidate.phone === source.phone) continue

    // Only match candidates whose shipment date is today
    const today = getTodayStr()
    if (candidate.shipmentDate !== today) continue

    const dateGap = daysBetween(source.rentalEnd, candidate.rentalStart)

    const candParts = parseAddress(candidate.address)

    let matchLevel: MatchLevel | null = null
    let matchReason = ''

    // Level 1: Same city
    if (sourceParts.city && candParts.city && sourceParts.city === candParts.city) {
      matchLevel = 'same_city'
      matchReason = sourceParts.city
    }
    // Level 2: Same province
    else if (sourceParts.province && candParts.province && sourceParts.province === candParts.province) {
      matchLevel = 'same_province'
      matchReason = sourceParts.province
    }
    // Level 3: Adjacent province
    else if (sourceParts.province && candParts.province &&
      isAdjacent(sourceParts.province, candParts.province)) {
      matchLevel = 'adjacent_province'
      matchReason = `${sourceParts.province} ↔ ${candParts.province}`
    }

    if (matchLevel) {
      // Add date info
      if (dateGap === 0) matchReason += ' · 当天衔接'
      else matchReason += ` · 间隔${dateGap}天`

      if (matchLevel === 'adjacent_province') {
        matchReason += ' · ⚠注意时效'
      }

      results.push({ customer: candidate, matchLevel, matchReason })
    }
  }

  // Sort: same_city first, then same_province, then adjacent_province
  // Within same level, sort by date proximity
  const order: Record<MatchLevel, number> = { same_city: 0, same_province: 1, adjacent_province: 2 }
  results.sort((a, b) => {
    if (a.matchLevel !== b.matchLevel) return order[a.matchLevel] - order[b.matchLevel]
    return Math.abs(daysBetween(source.rentalEnd, a.customer.rentalStart)) - Math.abs(daysBetween(source.rentalEnd, b.customer.rentalStart))
  })

  return results
}

function isAdjacent(a: string, b: string): boolean {
  const neighbors = ADJACENT[a]
  return neighbors ? neighbors.includes(b) : false
}

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA)
  const b = new Date(dateB)
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 999
  return Math.round((b.getTime() - a.getTime()) / (86400 * 1000))
}

function getTodayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ---- Build forwarding data from orders (not Excel) ----

interface OrderLike {
  customerName: string
  customerPhone: string
  customerAddress: string
  deviceId: string
  shipmentDate?: string
  rentalStart?: string
  rentalEnd?: string
  status: string
  platform?: string
  csRep?: string
  remarks?: string
}

export function buildForwardingFromOrders(orders: OrderLike[]): {
  expiringCustomers: ExpiringCustomer[]
  allCustomers: Customer[]
} {
  // Map orders to Customer format (only non-returned orders)
  const allCustomers: Customer[] = orders
    .filter(o => o.status !== 'returned')
    .map(o => ({
      name: o.customerName,
      phone: o.customerPhone,
      address: o.customerAddress,
      deviceId: o.deviceId,
      shipmentDate: o.shipmentDate || '',
      rentalStart: o.rentalStart || '',
      rentalEnd: o.rentalEnd || '',
      platform: o.platform || '',
      csRep: o.csRep || '',
      remarks: o.remarks || ''
    }))

  const expiring = findExpiringCustomers(allCustomers)
  const expiringWithOptions = buildExpiringWithOptions(expiring, allCustomers)

  return {
    expiringCustomers: expiringWithOptions,
    allCustomers
  }
}
