export const OFFICIAL_WEBSITE_URL = 'https://arocx.fun'
export const FEISHU_SETUP_GUIDE_URL = 'https://arocx.fun/feishu-setup/'
export const SUPPORT_EMAIL = 'ssdbh070605@gmail.com'
export const SUPPORT_EMAIL_MAILTO_URL = `mailto:${SUPPORT_EMAIL}`

export async function copySupportEmailToClipboard(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return false
  }

  try {
    await navigator.clipboard.writeText(SUPPORT_EMAIL)
    return true
  } catch {
    return false
  }
}
