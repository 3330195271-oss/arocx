import { app } from 'electron'
import { cpSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

export const APP_DISPLAY_NAME = 'arocx'
export const APP_DATA_DIR_NAME = 'arocx'
export const APP_ID = 'fun.arocx.desktop'

const LEGACY_DATA_DIR_NAME = '仓库管理助手'

function ensureDir(dir: string): string {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function getLegacyPackagedDataDir(): string {
  return join(app.getPath('documents'), LEGACY_DATA_DIR_NAME)
}

function getPackagedDataDir(): string {
  return join(app.getPath('documents'), APP_DATA_DIR_NAME)
}

function migrateLegacyPackagedDataDir(targetDir: string): void {
  const legacyDir = getLegacyPackagedDataDir()
  if (!existsSync(legacyDir)) return

  ensureDir(targetDir)

  try {
    cpSync(legacyDir, targetDir, {
      recursive: true,
      force: false,
      errorOnExist: false
    })
  } catch (error) {
    console.warn('[app-data-dir] legacy data copy skipped:', error)
  }
}

export function getAppDataDir(): string {
  if (!app.isPackaged) {
    return ensureDir(join(app.getAppPath(), 'data'))
  }

  const dir = getPackagedDataDir()
  migrateLegacyPackagedDataDir(dir)
  return ensureDir(dir)
}
