import type { AppVersionInfo, ClientPlatformInfo } from '../services/api-client'

export type UpdatePackageOption = {
  key: 'windows' | 'mac-arm64' | 'mac-x64'
  label: string
  detail: string
  url: string
  isRecommended: boolean
}

export function formatDetectedPlatform(platformInfo: ClientPlatformInfo | null | undefined): string {
  if (!platformInfo) return '未识别'

  if (platformInfo.platform === 'win32') {
    return platformInfo.arch === 'x64' ? 'Windows x64' : `Windows ${platformInfo.arch}`
  }

  if (platformInfo.platform === 'darwin') {
    if (platformInfo.arch === 'arm64') return 'Mac Apple 芯片'
    if (platformInfo.arch === 'x64') return 'Mac Intel'
    return `Mac ${platformInfo.arch}`
  }

  return `${platformInfo.platform} ${platformInfo.arch}`.trim()
}

function getRecommendedKey(platformInfo: ClientPlatformInfo | null | undefined): UpdatePackageOption['key'] | null {
  if (!platformInfo) return null
  if (platformInfo.platform === 'win32') return 'windows'
  if (platformInfo.platform === 'darwin' && platformInfo.arch === 'arm64') return 'mac-arm64'
  if (platformInfo.platform === 'darwin' && platformInfo.arch === 'x64') return 'mac-x64'
  return null
}

export function buildUpdatePackageOptions(updateInfo: AppVersionInfo | null | undefined, platformInfo: ClientPlatformInfo | null | undefined): UpdatePackageOption[] {
  if (!updateInfo) return []

  const recommendedKey = getRecommendedKey(platformInfo)
  const candidates: Array<Omit<UpdatePackageOption, 'isRecommended'>> = [
    {
      key: 'windows',
      label: 'Windows 版',
      detail: '适用于 Windows 电脑',
      url: updateInfo.downloadUrlWindows || updateInfo.downloadUrl || ''
    },
    {
      key: 'mac-arm64',
      label: 'Mac Apple 芯片版',
      detail: '适用于 M1 / M2 / M3 / M4',
      url: updateInfo.downloadUrlMacArm64 || ''
    },
    {
      key: 'mac-x64',
      label: 'Mac Intel 版',
      detail: '适用于 Intel 处理器 Mac',
      url: updateInfo.downloadUrlMacX64 || ''
    }
  ]

  return candidates
    .filter(option => option.url.trim())
    .map(option => ({
      ...option,
      isRecommended: option.key === recommendedKey
    }))
}
