/**
 * Cloud sync service — keeps local JSON mirrored with the logged-in account.
 */
import { isLoggedIn, pushOrders, pushDevices, pullOrders, pullDevices } from './api-client'
import type { Order, Device } from '../types/customer'

export type SyncOptions = {
  getOrders: () => Promise<Order[]>
  getDevices: () => Promise<Device[]>
  replaceOrders: (orders: Order[]) => Promise<boolean>
  replaceDevices: (devices: Device[]) => Promise<boolean>
  onApplied?: () => void
}

let syncTimer: ReturnType<typeof setInterval> | null = null
let syncing = false
const SYNC_INTERVAL_MS = 30_000
const SYNC_WAIT_TIMEOUT_MS = 15_000
const SYNC_WAIT_INTERVAL_MS = 120

export function buildElectronSyncOptions(onApplied?: () => void): SyncOptions {
  return {
    getOrders: () => window.electronAPI.getAllOrders(),
    getDevices: () => window.electronAPI.getDevices(),
    replaceOrders: (orders) => window.electronAPI.replaceLocalOrders(orders),
    replaceDevices: (devices) => window.electronAPI.replaceLocalDevices(devices),
    onApplied
  }
}

async function pullFromCloud(options: SyncOptions): Promise<void> {
  const [orders, devices] = await Promise.all([pullOrders(), pullDevices()])
  await Promise.all([
    options.replaceOrders(orders),
    options.replaceDevices(devices)
  ])
  options.onApplied?.()
}

async function pushToCloud(options: SyncOptions): Promise<void> {
  const [orders, devices] = await Promise.all([options.getOrders(), options.getDevices()])
  await Promise.all([
    pushOrders(orders),
    pushDevices(devices)
  ])
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

async function waitForIdle(): Promise<void> {
  const startedAt = Date.now()
  while (syncing) {
    if (Date.now() - startedAt >= SYNC_WAIT_TIMEOUT_MS) {
      throw new Error('云端同步仍在进行中，请稍后重试')
    }
    await sleep(SYNC_WAIT_INTERVAL_MS)
  }
}

async function runSyncCycle(options: SyncOptions, pullOnly = false): Promise<void> {
  if (!isLoggedIn()) {
    throw new Error('当前未登录，无法同步到云端')
  }
  syncing = true
  try {
    if (!pullOnly) {
      await pushToCloud(options)
    }
    await pullFromCloud(options)
    console.log('[sync] Cloud sync completed')
  } finally {
    syncing = false
  }
}

export function startCloudSync(options: SyncOptions) {
  if (syncTimer) return

  syncTimer = setInterval(() => {
    if (!isLoggedIn() || syncing) return
    runSyncCycle(options, true).catch((err: any) => {
      console.log('[sync] Cloud sync skipped:', err?.message || 'unknown error')
    })
  }, SYNC_INTERVAL_MS)
}

export function stopCloudSync() {
  if (syncTimer) {
    clearInterval(syncTimer)
    syncTimer = null
  }
}

export async function syncNow(options: SyncOptions): Promise<void> {
  await waitForIdle()
  await runSyncCycle(options)
}

export async function pullNow(options: SyncOptions): Promise<void> {
  await waitForIdle()
  await runSyncCycle(options, true)
}
