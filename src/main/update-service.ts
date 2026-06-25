import { spawn } from 'child_process'
import { createWriteStream, existsSync } from 'fs'
import { mkdir, unlink } from 'fs/promises'
import { get as httpGet } from 'http'
import { get as httpsGet } from 'https'
import { app, shell } from 'electron'
import { basename, extname, join } from 'path'
import type { GithubOptions } from 'builder-util-runtime'
import { NsisUpdater } from 'electron-updater'

type UpdateInstallResult = {
  success: boolean
  message: string
  filePath?: string
}

export type UpdateDownloadProgress = {
  stage: 'preparing' | 'downloading' | 'downloaded' | 'launching'
  percent: number
  transferred: number
  total: number | null
}

type ParsedGithubRelease = {
  owner: string
  repo: string
  host: string
  protocol: 'https' | 'http'
  vPrefixedTagName: boolean
  previousBlockmapBaseUrlOverride: string | null
}

const MAX_REDIRECTS = 5
let activeWindowsAutoUpdate: Promise<UpdateInstallResult> | null = null

function sanitizeFileName(url: string): string {
  try {
    const parsed = new URL(url)
    const rawName = basename(parsed.pathname) || `arocx-update-${Date.now()}`
    const decoded = decodeURIComponent(rawName)
    return decoded || `arocx-update-${Date.now()}`
  } catch {
    return `arocx-update-${Date.now()}`
  }
}

function ensureInstallerName(fileName: string): string {
  if (extname(fileName)) return fileName
  if (process.platform === 'win32') return `${fileName}.exe`
  if (process.platform === 'darwin') return `${fileName}.dmg`
  return fileName
}

function emitProgress(
  onProgress: ((progress: UpdateDownloadProgress) => void) | undefined,
  progress: UpdateDownloadProgress
): void {
  onProgress?.(progress)
}

function parseGithubReleaseAsset(downloadUrl: string, currentVersion: string): ParsedGithubRelease | null {
  try {
    const parsed = new URL(downloadUrl)
    if (parsed.hostname !== 'github.com') return null

    const parts = parsed.pathname.replace(/^\/+|\/+$/g, '').split('/')
    if (parts.length < 6 || parts[2] !== 'releases' || parts[3] !== 'download') {
      return null
    }

    const owner = parts[0]
    const repo = parts[1]
    const releaseTag = parts[4] || ''
    if (!owner || !repo || !releaseTag) return null

    const tagVersionMatch = releaseTag.match(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/)
    const previousReleaseTag = tagVersionMatch
      ? releaseTag.replace(tagVersionMatch[0], currentVersion)
      : (releaseTag.startsWith('v') ? `v${currentVersion}` : currentVersion)

    return {
      owner,
      repo,
      host: parsed.host,
      protocol: parsed.protocol === 'http:' ? 'http' : 'https',
      vPrefixedTagName: releaseTag.startsWith('v'),
      previousBlockmapBaseUrlOverride: `${parsed.protocol}//${parsed.host}/${owner}/${repo}/releases/download/${previousReleaseTag}`
    }
  } catch {
    return null
  }
}

function normalizeAutoUpdateError(error: any): Error {
  const rawMessage = String(error?.message || error || '未知错误')

  if (/latest\.yml/i.test(rawMessage) && /(404|Cannot find|Not Found)/i.test(rawMessage)) {
    return new Error('Windows 自动更新缺少 latest.yml，请把 latest.yml 和 .blockmap 一起上传到 GitHub Release')
  }

  if (/No published versions on GitHub/i.test(rawMessage)) {
    return new Error('GitHub Release 中还没有可用的 Windows 更新版本')
  }

  if (/net::ERR_INTERNET_DISCONNECTED|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT/i.test(rawMessage)) {
    return new Error('连接更新服务器失败，请检查网络后重试')
  }

  return new Error(rawMessage)
}

function createWindowsUpdater(downloadUrl: string): NsisUpdater | null {
  const currentVersion = app.getVersion()
  const githubRelease = parseGithubReleaseAsset(downloadUrl, currentVersion)
  if (!githubRelease) return null

  const feedConfig: GithubOptions = {
    provider: 'github',
    owner: githubRelease.owner,
    repo: githubRelease.repo,
    host: githubRelease.host,
    protocol: githubRelease.protocol,
    private: false,
    releaseType: 'release',
    vPrefixedTagName: githubRelease.vPrefixedTagName
  }

  const updater = new NsisUpdater(feedConfig)
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = true
  updater.autoRunAppAfterInstall = true
  updater.disableDifferentialDownload = false
  updater.previousBlockmapBaseUrlOverride = githubRelease.previousBlockmapBaseUrlOverride
  updater.logger = null

  return updater
}

async function downloadFile(
  url: string,
  onProgress?: (progress: UpdateDownloadProgress) => void,
  redirectCount = 0
): Promise<string> {
  if (redirectCount > MAX_REDIRECTS) {
    throw new Error('下载地址重定向次数过多')
  }

  const client = url.startsWith('https:') ? httpsGet : httpGet
  const downloadsDir = app.getPath('downloads')
  await mkdir(downloadsDir, { recursive: true })

  emitProgress(onProgress, {
    stage: 'preparing',
    percent: 0,
    transferred: 0,
    total: null
  })

  return await new Promise((resolve, reject) => {
    const request = client(url, response => {
      const statusCode = response.statusCode || 0
      const location = response.headers.location

      if (statusCode >= 300 && statusCode < 400 && location) {
        response.resume()
        const redirectedUrl = new URL(location, url).toString()
        downloadFile(redirectedUrl, onProgress, redirectCount + 1).then(resolve).catch(reject)
        return
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume()
        reject(new Error(`下载失败，服务器返回 ${statusCode}`))
        return
      }

      const fileName = ensureInstallerName(sanitizeFileName(url))
      const targetPath = join(
        downloadsDir,
        existsSync(join(downloadsDir, fileName)) ? `${Date.now()}-${fileName}` : fileName
      )
      const output = createWriteStream(targetPath)
      const total = Number(response.headers['content-length'] || 0) || null
      let transferred = 0

      const cleanup = async () => {
        output.close()
        await unlink(targetPath).catch(() => {})
      }

      output.on('error', err => {
        void cleanup().finally(() => reject(err))
      })

      response.on('error', err => {
        void cleanup().finally(() => reject(err))
      })

      response.on('data', chunk => {
        transferred += chunk.length
        const percent = total ? Math.min(100, Math.round((transferred / total) * 100)) : 0
        emitProgress(onProgress, {
          stage: 'downloading',
          percent,
          transferred,
          total
        })
      })

      output.on('finish', () => {
        output.close()
        emitProgress(onProgress, {
          stage: 'downloaded',
          percent: 100,
          transferred,
          total
        })
        resolve(targetPath)
      })

      response.pipe(output)
    })

    request.on('error', reject)
  })
}

async function downloadAndOpenInstaller(
  downloadUrl: string,
  onProgress?: (progress: UpdateDownloadProgress) => void
): Promise<UpdateInstallResult> {
  if (!downloadUrl.trim()) {
    throw new Error('当前版本没有可用的下载地址')
  }

  const installerPath = await downloadFile(downloadUrl.trim(), onProgress)
  emitProgress(onProgress, {
    stage: 'launching',
    percent: 100,
    transferred: 0,
    total: null
  })

  if (process.platform === 'win32') {
    const child = spawn(installerPath, [], {
      detached: true,
      stdio: 'ignore'
    })

    child.unref()
    setTimeout(() => app.quit(), 600)

    return {
      success: true,
      message: '安装包已下载并启动，应用会退出并进入更新安装。',
      filePath: installerPath
    }
  }

  const openResult = await shell.openPath(installerPath)
  if (openResult) {
    shell.showItemInFolder(installerPath)
    return {
      success: true,
      message: '安装包已下载完成，已打开所在位置，请手动完成安装。',
      filePath: installerPath
    }
  }

  return {
    success: true,
    message: '安装包已下载完成，已为你打开安装包，请按系统提示完成更新。',
    filePath: installerPath
  }
}

async function downloadAndInstallWindowsUpdate(
  downloadUrl: string,
  onProgress?: (progress: UpdateDownloadProgress) => void
): Promise<UpdateInstallResult> {
  const updater = createWindowsUpdater(downloadUrl)
  if (!updater || !app.isPackaged) {
    return downloadAndOpenInstaller(downloadUrl, onProgress)
  }

  if (activeWindowsAutoUpdate) {
    return activeWindowsAutoUpdate
  }

  activeWindowsAutoUpdate = new Promise<UpdateInstallResult>((resolve, reject) => {
    let settled = false

    const cleanup = () => {
      updater.removeAllListeners('checking-for-update')
      updater.removeAllListeners('update-available')
      updater.removeAllListeners('update-not-available')
      updater.removeAllListeners('download-progress')
      updater.removeAllListeners('update-downloaded')
      updater.removeAllListeners('error')
    }

    const finishSuccess = (result: UpdateInstallResult) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }

    const finishError = (error: any) => {
      if (settled) return
      settled = true
      cleanup()
      reject(normalizeAutoUpdateError(error))
    }

    updater.once('checking-for-update', () => {
      emitProgress(onProgress, {
        stage: 'preparing',
        percent: 0,
        transferred: 0,
        total: null
      })
    })

    updater.once('update-available', () => {
      void updater.downloadUpdate().catch(finishError)
    })

    updater.once('update-not-available', () => {
      finishSuccess({
        success: true,
        message: '当前已经是最新版本，无需安装更新。'
      })
    })

    updater.on('download-progress', info => {
      emitProgress(onProgress, {
        stage: 'downloading',
        percent: Math.max(0, Math.min(100, Math.round(info.percent || 0))),
        transferred: info.transferred,
        total: info.total || null
      })
    })

    updater.once('update-downloaded', () => {
      emitProgress(onProgress, {
        stage: 'downloaded',
        percent: 100,
        transferred: 0,
        total: null
      })
      emitProgress(onProgress, {
        stage: 'launching',
        percent: 100,
        transferred: 0,
        total: null
      })

      finishSuccess({
        success: true,
        message: '更新已下载完成，正在自动安装并重启软件。'
      })

      setTimeout(() => {
        try {
          updater.quitAndInstall(true, true)
        } catch (error) {
          console.error('[update] quitAndInstall error:', error)
        }
      }, 400)
    })

    updater.once('error', finishError)

    void updater.checkForUpdates().then(result => {
      if (!result) {
        finishError(new Error('当前环境暂时无法使用自动更新'))
      }
    }).catch(finishError)
  }).finally(() => {
    activeWindowsAutoUpdate = null
  })

  return activeWindowsAutoUpdate
}

export async function downloadAndInstallUpdate(
  downloadUrl: string,
  onProgress?: (progress: UpdateDownloadProgress) => void
): Promise<UpdateInstallResult> {
  if (process.platform === 'win32') {
    return downloadAndInstallWindowsUpdate(downloadUrl, onProgress)
  }

  return downloadAndOpenInstaller(downloadUrl, onProgress)
}
