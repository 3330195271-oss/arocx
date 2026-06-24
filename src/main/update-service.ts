import { spawn } from 'child_process'
import { createWriteStream, existsSync } from 'fs'
import { mkdir, unlink } from 'fs/promises'
import { get as httpGet } from 'http'
import { get as httpsGet } from 'https'
import { app, shell } from 'electron'
import { basename, extname, join } from 'path'

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

const MAX_REDIRECTS = 5

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

export async function downloadAndInstallUpdate(
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
