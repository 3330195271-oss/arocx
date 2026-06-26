const fallbackConfig = {
  latestVersion: '1.0.8',
  downloadUrlWindows: 'https://github.com/3330195271-oss/arocx/releases/download/v1.0.8/arocx-1.0.8-x64.exe',
  downloadUrlMacArm64: 'https://github.com/3330195271-oss/arocx/releases/download/v1.0.8/arocx-1.0.8-arm64-mac.dmg',
  downloadUrlMacX64: '',
  publishedAt: '2026-06-26T14:30:00+08:00',
  releaseNotes: `【1.0.8 本次更新】

1. 企业协作改为以企业主数据为准，成员加入后会直接看到企业统一的订单、库存和发货记录。
2. 好友代发流程补齐：帮好友发货后，双方的发货信息里都会保留记录，并标注代发关系。
3. AI 截图录单改为统一云端识别，不再需要在每台电脑单独配置识别密钥。
4. 技术支持改为弹窗展示邮箱，可直接复制地址或一键调用邮件应用发信。
5. 官网与下载页优化：功能标签可点击跳转，新增回到顶部和 GitHub 发布入口，查功能和下载更方便。
6. 多项同步与稳定性修复：企业切换、发货视图、飞书同步与更新流程更顺畅。`
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
