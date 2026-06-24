const fallbackConfig = {
  latestVersion: '1.0.6',
  downloadUrlWindows: 'https://github.com/3330195271-oss/arocx/releases/download/v1.0.6/arocx-1.0.6-x64.exe',
  downloadUrlMacArm64: 'https://github.com/3330195271-oss/arocx/releases/download/v1.0.6/arocx-1.0.6-arm64-mac.dmg',
  downloadUrlMacX64: '',
  publishedAt: '2026-06-24T22:30:00+08:00',
  releaseNotes: `【1.0.6 本次更新】

1. 新增企业协作，Pro+ 用户可创建企业并共享订单与库存数据。
2. 新增好友代发，可把待发货订单分享给好友协助发货。
3. 订单管理支持删除订单，并补充起租日、到期日、发货日等关键信息展示。
4. 更新流程增加下载进度提示，并补充官网入口与技术支持邮箱。
5. 单设备登录与云端同步链路已进一步优化，使用更稳定。`
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
