import { Router, Request, Response } from 'express'
import { access, readdir, unlink } from 'fs/promises'
import { basename, join } from 'path'
import { authMiddleware } from '../middleware/auth'
import { query } from '../db'
import { getAdminSecret } from '../config'

const router = Router()
const ADMIN_SECRET = getAdminSecret()
const APP_DOWNLOADS_DIR = process.env.APP_DOWNLOADS_DIR || join(process.cwd(), 'uploads', 'app')
const PACKAGE_FILE_PATTERN = /\.(exe|dmg|zip|blockmap)$/i

function normalizeVersion(version: string): number[] {
  return version
    .trim()
    .replace(/^v/i, '')
    .split('.')
    .map(part => parseInt(part, 10))
    .filter(num => Number.isFinite(num))
}

function compareVersions(a: string, b: string): number {
  const left = normalizeVersion(a)
  const right = normalizeVersion(b)
  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i++) {
    const l = left[i] || 0
    const r = right[i] || 0
    if (l > r) return 1
    if (l < r) return -1
  }
  return 0
}

type AppVersionConfig = {
  latestVersion: string
  minimumVersion: string
  downloadUrl: string
  downloadUrlWindows: string
  downloadUrlMacArm64: string
  downloadUrlMacX64: string
  releaseNotes: string
  publishedAt: string | null
}

const APP_SETTING_KEYS = {
  latestVersion: 'app_latest_version',
  minimumVersion: 'app_minimum_version',
  downloadUrl: 'app_download_url',
  downloadUrlWindows: 'app_download_url_windows',
  downloadUrlMacArm64: 'app_download_url_mac_arm64',
  downloadUrlMacX64: 'app_download_url_mac_x64',
  releaseNotes: 'app_release_notes',
  publishedAt: 'app_published_at'
} as const

function normalizePlatform(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function normalizeArch(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function inferPlatformFromUserAgent(userAgent: string | undefined): string {
  const ua = String(userAgent || '').toLowerCase()
  if (ua.includes('windows')) return 'win32'
  if (ua.includes('macintosh') || ua.includes('mac os x')) return 'darwin'
  if (ua.includes('linux')) return 'linux'
  return ''
}

function extractFileNameFromUrl(url: string): string | null {
  const value = String(url || '').trim()
  if (!value) return null

  try {
    const parsed = new URL(value)
    const fileName = basename(decodeURIComponent(parsed.pathname || ''))
    return fileName || null
  } catch {
    return null
  }
}

function buildKeepFileSets(urls: string[]): { primaryFiles: Set<string>; keepFiles: Set<string> } {
  const primaryFiles = new Set<string>()
  const keepFiles = new Set<string>()

  for (const url of urls) {
    const fileName = extractFileNameFromUrl(url)
    if (!fileName) continue

    primaryFiles.add(fileName)
    keepFiles.add(fileName)

    if (!fileName.endsWith('.blockmap')) {
      keepFiles.add(`${fileName}.blockmap`)
    }
  }

  return { primaryFiles, keepFiles }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function cleanupOldPackages(urls: string[]): Promise<void> {
  const { primaryFiles, keepFiles } = buildKeepFileSets(urls)
  if (primaryFiles.size === 0) {
    console.log('[subscription] cleanup skipped: no local package files configured')
    return
  }

  const missingPrimaryFiles: string[] = []
  for (const fileName of primaryFiles) {
    const exists = await fileExists(join(APP_DOWNLOADS_DIR, fileName))
    if (!exists) missingPrimaryFiles.push(fileName)
  }

  if (missingPrimaryFiles.length > 0) {
    console.warn('[subscription] cleanup skipped: current package files not found in downloads dir:', missingPrimaryFiles.join(', '))
    return
  }

  const files = await readdir(APP_DOWNLOADS_DIR).catch(() => [])
  const deletedFiles: string[] = []

  for (const fileName of files) {
    if (!PACKAGE_FILE_PATTERN.test(fileName)) continue
    if (keepFiles.has(fileName)) continue

    await unlink(join(APP_DOWNLOADS_DIR, fileName)).catch(() => {})
    deletedFiles.push(fileName)
  }

  if (deletedFiles.length > 0) {
    console.log('[subscription] cleaned old app packages:', deletedFiles.join(', '))
  } else {
    console.log('[subscription] cleanup completed: no old app packages removed')
  }
}

function resolveDownloadUrl(config: Pick<AppVersionConfig, 'downloadUrl' | 'downloadUrlWindows' | 'downloadUrlMacArm64' | 'downloadUrlMacX64'>, platform?: string, arch?: string): string {
  const normalizedPlatform = normalizePlatform(platform)
  const normalizedArch = normalizeArch(arch)

  if (!normalizedPlatform) {
    return config.downloadUrl || config.downloadUrlWindows || config.downloadUrlMacArm64 || config.downloadUrlMacX64 || ''
  }

  if (normalizedPlatform === 'win32') {
    return config.downloadUrlWindows || config.downloadUrl || ''
  }

  if (normalizedPlatform === 'darwin') {
    if (normalizedArch === 'arm64') return config.downloadUrlMacArm64 || ''
    if (normalizedArch === 'x64') return config.downloadUrlMacX64 || ''
    return config.downloadUrlMacArm64 || config.downloadUrlMacX64 || ''
  }

  return config.downloadUrl || ''
}

async function getStoredAppVersionConfig(): Promise<Partial<AppVersionConfig>> {
  const result = await query(
    'SELECT key, value FROM app_settings WHERE key = ANY($1::varchar[])',
    [Object.values(APP_SETTING_KEYS)]
  )

  const values = new Map<string, string>(result.rows.map(row => [row.key, row.value]))

  return {
    latestVersion: values.get(APP_SETTING_KEYS.latestVersion),
    minimumVersion: values.get(APP_SETTING_KEYS.minimumVersion),
    downloadUrl: values.get(APP_SETTING_KEYS.downloadUrl),
    downloadUrlWindows: values.get(APP_SETTING_KEYS.downloadUrlWindows),
    downloadUrlMacArm64: values.get(APP_SETTING_KEYS.downloadUrlMacArm64),
    downloadUrlMacX64: values.get(APP_SETTING_KEYS.downloadUrlMacX64),
    releaseNotes: values.get(APP_SETTING_KEYS.releaseNotes),
    publishedAt: values.get(APP_SETTING_KEYS.publishedAt) || null
  }
}

async function resolveAppVersionConfig(currentVersion: string, platform?: string, arch?: string): Promise<AppVersionConfig> {
  const stored = await getStoredAppVersionConfig()
  const latestVersion = stored.latestVersion || process.env.APP_LATEST_VERSION || process.env.APP_CURRENT_VERSION || '1.0.0'
  const minimumVersion = stored.minimumVersion || process.env.APP_MINIMUM_VERSION || latestVersion
  const genericDownloadUrl = stored.downloadUrl || process.env.APP_DOWNLOAD_URL || ''
  const downloadUrlWindows = stored.downloadUrlWindows || process.env.APP_DOWNLOAD_URL_WINDOWS || genericDownloadUrl
  const downloadUrlMacArm64 = stored.downloadUrlMacArm64 || process.env.APP_DOWNLOAD_URL_MAC_ARM64 || ''
  const downloadUrlMacX64 = stored.downloadUrlMacX64 || process.env.APP_DOWNLOAD_URL_MAC_X64 || ''
  const releaseNotes = stored.releaseNotes || process.env.APP_RELEASE_NOTES || ''
  const publishedAt = stored.publishedAt || process.env.APP_PUBLISHED_AT || null
  const downloadUrl = resolveDownloadUrl({
    downloadUrl: genericDownloadUrl,
    downloadUrlWindows,
    downloadUrlMacArm64,
    downloadUrlMacX64
  }, platform, arch)

  return {
    latestVersion,
    minimumVersion,
    downloadUrl,
    downloadUrlWindows,
    downloadUrlMacArm64,
    downloadUrlMacX64,
    releaseNotes,
    publishedAt
  }
}

// Tier definitions
const TIERS = {
  free: {
    name: '免费版',
    features: [
      '基础订单管理',
      '设备库存管理',
      'Excel 表格导入',
      '本地数据存储',
    ],
    price: '免费',
  },
  team: {
    name: 'Pro+版',
    features: [
      '免费版全部功能',
      '企业微信通知',
      '云数据同步',
      '多设备登录',
      'AI 截图录单',
    ],
    price: '¥29/月',
  },
  pro: {
    name: 'Plus版',
    features: [
      'Pro+版全部功能',
      '飞书共享表格同步',
      '多客服协作',
      'API 开放接口',
      '优先技术支持',
      '自定义数据导出',
    ],
    price: '¥59/月',
  },
}

// Get all subscription plans
router.get('/plans', (_req: Request, res: Response) => {
  res.json({ tiers: TIERS })
})

router.get('/app-version', async (req: Request, res: Response) => {
  try {
    const currentVersion = String(req.query.currentVersion || process.env.APP_CURRENT_VERSION || '1.0.0')
    const platform = String(req.query.platform || inferPlatformFromUserAgent(req.get('user-agent')) || '')
    const arch = String(req.query.arch || '')
    const config = await resolveAppVersionConfig(currentVersion, platform, arch)

    res.json({
      currentVersion,
      ...config,
      hasUpdate: compareVersions(config.latestVersion, currentVersion) > 0,
      forceUpdate: compareVersions(config.minimumVersion, currentVersion) > 0
    })
  } catch (error: any) {
    console.error('[subscription] app-version error:', error.message)
    res.status(500).json({ error: '获取版本信息失败' })
  }
})

router.post('/app-version/admin/get', async (req: Request, res: Response) => {
  try {
    const { adminSecret } = req.body
    if (adminSecret !== ADMIN_SECRET) {
      res.status(403).json({ error: '管理员密钥错误' })
      return
    }

    const config = await resolveAppVersionConfig(process.env.APP_CURRENT_VERSION || '1.0.0')
    res.json(config)
  } catch (error: any) {
    console.error('[subscription] app-version admin get error:', error.message)
    res.status(500).json({ error: '读取版本配置失败' })
  }
})

router.post('/app-version/admin/update', async (req: Request, res: Response) => {
  try {
    const {
      adminSecret,
      latestVersion,
      minimumVersion,
      downloadUrl = '',
      downloadUrlWindows = '',
      downloadUrlMacArm64 = '',
      downloadUrlMacX64 = '',
      releaseNotes = '',
      publishedAt
    } = req.body

    if (adminSecret !== ADMIN_SECRET) {
      res.status(403).json({ error: '管理员密钥错误' })
      return
    }

    if (!latestVersion || typeof latestVersion !== 'string') {
      res.status(400).json({ error: '请填写最新版本号' })
      return
    }

    if (!minimumVersion || typeof minimumVersion !== 'string') {
      res.status(400).json({ error: '请填写最低支持版本' })
      return
    }

    if (compareVersions(latestVersion, minimumVersion) < 0) {
      res.status(400).json({ error: '最新版本号不能低于最低支持版本' })
      return
    }

    const finalPublishedAt = typeof publishedAt === 'string' && publishedAt.trim()
      ? publishedAt.trim()
      : new Date().toISOString()
    const finalDefaultDownloadUrl = String(downloadUrl).trim() || String(downloadUrlWindows).trim()
    const finalWindowsDownloadUrl = String(downloadUrlWindows).trim() || finalDefaultDownloadUrl
    const finalMacArm64DownloadUrl = String(downloadUrlMacArm64).trim()
    const finalMacX64DownloadUrl = String(downloadUrlMacX64).trim()

    const entries: Array<[string, string]> = [
      [APP_SETTING_KEYS.latestVersion, latestVersion.trim()],
      [APP_SETTING_KEYS.minimumVersion, minimumVersion.trim()],
      [APP_SETTING_KEYS.downloadUrl, finalDefaultDownloadUrl],
      [APP_SETTING_KEYS.downloadUrlWindows, finalWindowsDownloadUrl],
      [APP_SETTING_KEYS.downloadUrlMacArm64, finalMacArm64DownloadUrl],
      [APP_SETTING_KEYS.downloadUrlMacX64, finalMacX64DownloadUrl],
      [APP_SETTING_KEYS.releaseNotes, String(releaseNotes).trim()],
      [APP_SETTING_KEYS.publishedAt, finalPublishedAt]
    ]

    for (const [key, value] of entries) {
      await query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, value]
      )
    }

    await cleanupOldPackages([
      finalWindowsDownloadUrl,
      finalMacArm64DownloadUrl,
      finalMacX64DownloadUrl
    ])

    res.json({
      success: true,
      config: {
        latestVersion: latestVersion.trim(),
        minimumVersion: minimumVersion.trim(),
        downloadUrl: finalDefaultDownloadUrl,
        downloadUrlWindows: finalWindowsDownloadUrl,
        downloadUrlMacArm64: finalMacArm64DownloadUrl,
        downloadUrlMacX64: finalMacX64DownloadUrl,
        releaseNotes: String(releaseNotes).trim(),
        publishedAt: finalPublishedAt
      }
    })
  } catch (error: any) {
    console.error('[subscription] app-version admin update error:', error.message)
    res.status(500).json({ error: '发布版本失败' })
  }
})

// Get current user's subscription info
router.get('/my', authMiddleware, async (_req: Request, res: Response) => {
  const user = (_req as any).user
  const tier = TIERS[user.tier as keyof typeof TIERS] || TIERS.free
  res.json({
    tier: user.tier,
    tierName: tier.name,
    features: tier.features,
    price: tier.price,
    subscriptionExpires: user.subscriptionExpires || null,
    createdAt: user.createdAt || null,
  })
})

export default router
