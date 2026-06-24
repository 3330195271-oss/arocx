import { buildElectronSyncOptions, syncNow } from './sync-service'

export async function syncOrdersAfterMutation(): Promise<void> {
  try {
    await syncNow(buildElectronSyncOptions())
  } catch (error: any) {
    console.log('[sync] Order mutation sync skipped:', error?.message || 'unknown error')
  }
}
