export type RendererUpdateProgress = {
  stage: 'preparing' | 'downloading' | 'downloaded' | 'launching'
  percent: number
  transferred: number
  total: number | null
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value >= 100 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

export function getUpdateProgressLabel(progress: RendererUpdateProgress | null): string {
  if (!progress) return ''
  if (progress.stage === 'preparing') return '准备下载更新包...'
  if (progress.stage === 'downloaded') return '下载完成，正在准备打开安装包...'
  if (progress.stage === 'launching') return '正在启动安装流程...'
  if (!progress.total) return `正在下载更新包... ${formatBytes(progress.transferred)}`
  return `正在下载更新包... ${progress.percent}% (${formatBytes(progress.transferred)} / ${formatBytes(progress.total)})`
}
