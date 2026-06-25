const fallbackConfig = {
  latestVersion: '1.0.7',
  downloadUrlWindows: 'https://github.com/3330195271-oss/arocx/releases/download/v1.0.7/arocx-1.0.7-x64.exe',
  downloadUrlMacArm64: 'https://github.com/3330195271-oss/arocx/releases/download/v1.0.7/arocx-1.0.7-arm64-mac.dmg',
  downloadUrlMacX64: '',
  publishedAt: '2026-06-25T19:46:59+08:00',
  releaseNotes: `【1.0.7 本次更新】

1. 企业协作升级：企业成员进入订单管理、设备库存、发货信息后可直接查看企业全部数据，并在 30 秒内自动刷新同步。
2. Windows 版升级体验优化：支持自动下载安装更新，并显示下载进度。
3. 飞书接入补充完整教程，软件内可直接打开接入说明页。
4. 首页与设置体验优化：官网入口、技术支持邮箱、更新弹窗与安装包选择更清晰。
5. 多项稳定性修复：修复技术支持入口、设置页升级按钮等细节问题，云端协作更稳定。`
}

const endpoints = [
  '/api/subscription/app-version?currentVersion=0.0.0',
  'https://arocx.fun/api/subscription/app-version?currentVersion=0.0.0'
]

function formatDate(value) {
  if (!value) return '发布于近期'
  const text = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return `发布于 ${text.slice(0, 10)}`
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return '发布于近期'
  return `发布于 ${date.toISOString().slice(0, 10)}`
}

function parseReleaseNotes(notes) {
  return String(notes || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('【'))
    .map(line => line.replace(/^\d+[.)、]?\s*/, '').replace(/^[-•]\s*/, ''))
    .slice(0, 5)
}

function setText(selector, value) {
  document.querySelectorAll(selector).forEach(node => {
    node.textContent = value
  })
}

function setHref(selector, href) {
  const node = document.querySelector(selector)
  if (!node || !href) return
  node.setAttribute('href', href)
}

function normalizeDownloadUrl(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  try {
    const url = new URL(text, window.location.origin)
    if (url.pathname.startsWith('/downloads/app/')) {
      return `${window.location.origin}${url.pathname}`
    }
    return url.toString()
  } catch {
    return text
  }
}

function updateDownloadCards(config) {
  setText('[data-version-text]', config.latestVersion || fallbackConfig.latestVersion)
  setText('[data-published-text]', formatDate(config.publishedAt || fallbackConfig.publishedAt))

  const windowsUrl = normalizeDownloadUrl(config.downloadUrlWindows || fallbackConfig.downloadUrlWindows)
  const macArmUrl = normalizeDownloadUrl(config.downloadUrlMacArm64 || fallbackConfig.downloadUrlMacArm64)
  const macX64Url = normalizeDownloadUrl(config.downloadUrlMacX64 || fallbackConfig.downloadUrlMacX64)

  setHref('#hero-download-windows', windowsUrl)
  setHref('#download-windows-card', windowsUrl)
  setHref('#download-mac-arm-card', macArmUrl)

  const intelCard = document.getElementById('download-mac-x64-card')
  if (!intelCard) return

  if (macX64Url) {
    const anchor = document.createElement('a')
    anchor.className = 'download-item'
    anchor.id = 'download-mac-x64-card'
    anchor.href = macX64Url
    anchor.target = '_blank'
    anchor.rel = 'noreferrer'
    anchor.innerHTML = `
      <div class="download-item__eyebrow">Intel Mac</div>
      <h3>macOS Intel</h3>
      <p>适用于旧款 Intel 处理器 Mac 设备。</p>
      <span>下载 DMG</span>
    `
    intelCard.replaceWith(anchor)
  }
}

function updateReleaseNotes(config) {
  const releaseList = document.getElementById('release-list')
  if (!releaseList) return

  const items = parseReleaseNotes(config.releaseNotes || fallbackConfig.releaseNotes)
  if (!items.length) return

  releaseList.innerHTML = items
    .map(item => `<li>${item}</li>`)
    .join('')
}

function setupBackToTop() {
  const button = document.getElementById('back-to-top')
  if (!button) return

  const toggleVisibility = () => {
    button.classList.toggle('is-visible', window.scrollY > 320)
  }

  button.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })

  window.addEventListener('scroll', toggleVisibility, { passive: true })
  toggleVisibility()
}

async function loadVersionConfig() {
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint)
      if (!response.ok) continue
      return await response.json()
    } catch {
      // try next endpoint
    }
  }
  return fallbackConfig
}

loadVersionConfig().then(config => {
  updateDownloadCards(config)
  updateReleaseNotes(config)
})

setupBackToTop()
