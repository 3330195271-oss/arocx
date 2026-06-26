const fallbackConfig = {
  latestVersion: '1.0.9',
  downloadUrlWindows: 'https://github.com/3330195271-oss/arocx/releases/download/v1.0.9/arocx-1.0.9-x64.exe',
  downloadUrlMacArm64: 'https://github.com/3330195271-oss/arocx/releases/download/v1.0.9/arocx-1.0.9-arm64-mac.dmg',
  downloadUrlMacX64: '',
  publishedAt: '2026-06-26T18:50:00+08:00',
  releaseNotes: `【1.0.9 本次更新】

1. 企业协作同步节奏调整为每 30 分钟自动刷新，并新增顶部“手动同步”按钮，成员可随时拉取最新订单、库存和发货记录。
2. 订单发货弹窗支持“入库并发货”：如果输入的序列号暂时不在库存里，可以直接补入设备并完成发货。
3. 企业订单、设备库存、发货信息三处的同步提示已统一，协作时更容易判断当前看到的是不是最新数据。
4. 企业发货链路补齐了服务端校验，不同电脑上处理同一批订单时，入库与发货结果会保持一致。
5. 多项细节优化与稳定性修复，减少协作场景下的来回刷新和重复操作。`
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
