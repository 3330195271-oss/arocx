import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { arch, hostname, platform } from 'os'
import { join } from 'path'
import { getAppDataDir } from './app-data-dir'

type StoredDeviceIdentity = {
  deviceId: string
}

export type ClientDeviceIdentity = {
  deviceId: string
  deviceName: string
}

function getIdentityFilePath(): string {
  const dir = getAppDataDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'device.identity.json')
}

function readStoredIdentity(): StoredDeviceIdentity | null {
  try {
    const filePath = getIdentityFilePath()
    if (!existsSync(filePath)) return null
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as Partial<StoredDeviceIdentity>
    if (!parsed.deviceId || typeof parsed.deviceId !== 'string') return null
    return { deviceId: parsed.deviceId }
  } catch {
    return null
  }
}

function writeStoredIdentity(identity: StoredDeviceIdentity): void {
  writeFileSync(getIdentityFilePath(), JSON.stringify(identity, null, 2), 'utf-8')
}

function ensureDeviceId(): string {
  const existing = readStoredIdentity()
  if (existing?.deviceId) return existing.deviceId
  const created = { deviceId: `devc_${randomUUID()}` }
  writeStoredIdentity(created)
  return created.deviceId
}

function buildDeviceName(): string {
  return `${hostname()} (${platform()} ${arch()})`
}

export function getClientDeviceIdentity(): ClientDeviceIdentity {
  return {
    deviceId: ensureDeviceId(),
    deviceName: buildDeviceName()
  }
}
