/**
 * 企业微信 Webhook 通知服务
 *
 * 配置：在设置中填入 Webhook URL（群机器人）
 * 获取方式：企业微信群 → 群设置 → 群机器人 → 添加 → 复制 Webhook 地址
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Device, Order } from '../types/customer'
import { getAppDataDir } from './app-data-dir'

interface WecomConfig {
  webhookUrl: string
  enabled: boolean
  channelType?: 'wecom' | 'platform'
  channelName?: string
}

export interface NotificationSummary {
  todayPendingShipmentCount: number
  expiringSoonCount: number
  overdueCount: number
  totalInventory: number
  idleInventory: number
  rentingInventory: number
}

function getConfigPath(): string {
  return join(getAppDataDir(), 'wecom-config.json')
}

export function getWecomConfig(): WecomConfig {
  try {
    if (existsSync(getConfigPath())) {
      return JSON.parse(readFileSync(getConfigPath(), 'utf-8'))
    }
  } catch {}
  return { webhookUrl: '', enabled: false }
}

export function saveWecomConfig(config: WecomConfig): void {
  const dir = getAppDataDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8')
}

function getTodayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function diffDaysFromToday(dateStr?: string): number | null {
  if (!dateStr) return null
  const target = new Date(dateStr)
  if (Number.isNaN(target.getTime())) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

export function buildNotificationSummary(orders: Order[], devices: Device[]): NotificationSummary {
  const today = getTodayStr()
  const activeOrders = orders.filter(order => order.status !== 'returned')

  const todayPendingShipmentCount = orders.filter(order =>
    order.status === 'pending' && order.shipmentDate === today
  ).length

  const expiringSoonCount = activeOrders.filter(order => {
    const days = diffDaysFromToday(order.rentalEnd)
    return days !== null && days >= 0 && days <= 3
  }).length

  const overdueCount = activeOrders.filter(order => {
    const days = diffDaysFromToday(order.rentalEnd)
    return days !== null && days < 0
  }).length

  const totalInventory = devices.length
  const idleInventory = devices.filter(device => device.status === 'idle').length
  const rentingInventory = devices.filter(device => device.status === 'renting').length

  return {
    todayPendingShipmentCount,
    expiringSoonCount,
    overdueCount,
    totalInventory,
    idleInventory,
    rentingInventory
  }
}

async function sendMarkdownMessage(title: string, lines: string[]): Promise<boolean> {
  const config = getWecomConfig()
  if (!config.enabled || !config.webhookUrl) return false

  const body = {
    msgtype: 'markdown',
    markdown: {
      content: [title, '', ...lines].join('\n')
    }
  }

  try {
    const resp = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await resp.json()
    return data.errcode === 0
  } catch {
    return false
  }
}

export async function sendDispatchNotification(params: {
  customerName: string
  customerPhone: string
  deviceModel: string
  serialNumber: string
  trackingNumber: string
  csRep?: string
  platform?: string
  address?: string
}): Promise<boolean> {
  const lines = [
    `客户：<font color="info">${params.customerName}</font>`,
    `电话：${params.customerPhone}`,
    `设备：${params.deviceModel}`,
    `序列号：${params.serialNumber}`,
    `快递单号：<font color="warning">${params.trackingNumber}</font>`,
  ]
  if (params.platform) lines.push(`平台：${params.platform}`)
  if (params.csRep) lines.push(`客服：${params.csRep}`)
  if (params.address) {
    const shortAddr = params.address.length > 30
      ? params.address.slice(0, 30) + '...'
      : params.address
    lines.push(`地址：${shortAddr}`)
  }

  return sendMarkdownMessage('📦 **发货通知**', lines)
}

export async function sendForwardNotification(params: {
  fromCustomer: string
  toCustomer: string
  deviceModel: string
  trackingNumber: string
  csRep?: string
}): Promise<boolean> {
  return sendMarkdownMessage('🔄 **转寄通知**', [
    `从：<font color="info">${params.fromCustomer}</font>`,
    `转寄给：<font color="info">${params.toCustomer}</font>`,
    `设备：${params.deviceModel}`,
    `转寄快递：<font color="warning">${params.trackingNumber}</font>`,
    params.csRep ? `客服：${params.csRep}` : ''
  ].filter(Boolean))
}

export async function sendSummaryNotification(summary: NotificationSummary): Promise<boolean> {
  const config = getWecomConfig()
  const channelLabel = config.channelType === 'platform' ? '平台微信' : '企业微信'

  return sendMarkdownMessage('📣 **今日业务提醒**', [
    `通道：${channelLabel}${config.channelName ? ` · ${config.channelName}` : ''}`,
    `待发货：<font color="warning">${summary.todayPendingShipmentCount}</font> 单`,
    `即将到期：<font color="comment">${summary.expiringSoonCount}</font> 单（3天内）`,
    `已逾期：<font color="warning">${summary.overdueCount}</font> 单`,
    `库存总数：${summary.totalInventory} 台`,
    `空闲库存：<font color="info">${summary.idleInventory}</font> 台`,
    `租用中：${summary.rentingInventory} 台`,
    `时间：${new Date().toLocaleString('zh-CN')}`
  ])
}
