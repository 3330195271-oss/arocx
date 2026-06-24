export const OFFICIAL_WEBSITE_URL = 'https://arocx.fun'
export const SUPPORT_EMAIL = 'ssdbh070605@gmail.com'

export function buildSupportMailto(): string {
  const params = new URLSearchParams({
    subject: 'arocx 技术支持',
    body: [
      '您好，',
      '',
      '我在使用 arox 时遇到了以下问题：',
      '',
      '问题描述：',
      '',
      '复现步骤：',
      '',
      '当前版本：',
      '设备系统：',
      '',
      '谢谢。'
    ].join('\n')
  })

  return `mailto:${SUPPORT_EMAIL}?${params.toString()}`
}
