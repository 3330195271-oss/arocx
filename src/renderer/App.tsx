import { useState, useCallback, useEffect, useRef } from 'react'
import type { AppData, ExpiringCustomer } from './types/customer'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { MainContent } from './components/MainContent'
import { StatusBar } from './components/StatusBar'
import { Dashboard } from './components/Dashboard'
import { DeviceInventory } from './components/DeviceInventory'
import { OrderPanel } from './components/OrderPanel'
import { ShippingInfo } from './components/ShippingInfo'
import { ScreenshotOrder } from './components/ScreenshotOrder'
import { LoginPage } from './components/LoginPage'
import { HomePage } from './components/HomePage'
import { WecomSettings } from './components/WecomSettings'
import { AdminPanel } from './components/AdminPanel'
import { FriendsPage } from './components/FriendsPage'
import { EnterprisePage } from './components/EnterprisePage'
import { FeishuSyncPage } from './components/FeishuSyncPage'
import { getLatestAppVersion, isLoggedIn, verifyToken, getUser, logout as apiLogout } from './services/api-client'
import { startCloudSync, stopCloudSync, syncNow, pullNow, buildElectronSyncOptions } from './services/sync-service'
import type { TabKey } from './components/NavTabs'
import type { HomeNavigationTarget } from './types/home-navigation'
import type { AppVersionInfo, ClientPlatformInfo } from './services/api-client'
import { buildUpdatePackageOptions, formatDetectedPlatform } from './utils/update-packages'
import { OFFICIAL_WEBSITE_URL } from './utils/external-links'
import { getUpdateProgressLabel, type RendererUpdateProgress } from './utils/update-progress'

const SYNC_INTERVAL_SEC = 60
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

function buildStorageScope(user: { userId: number; email: string } | null | undefined): string {
  if (!user) return 'guest'
  return `user-${user.userId}`
}

function isOrderIntent(target: HomeNavigationTarget | null): target is Extract<HomeNavigationTarget, { tab: 'orders' }> {
  return !!target && target.tab === 'orders'
}

function isInventoryIntent(target: HomeNavigationTarget | null): target is Extract<HomeNavigationTarget, { tab: 'inventory' }> {
  return !!target && target.tab === 'inventory'
}

export default function App(): JSX.Element {
  const [currentPage, setCurrentPage] = useState<'home' | TabKey>('home')
  const [pageIntent, setPageIntent] = useState<HomeNavigationTarget | null>(null)
  const [data, setData] = useState<AppData | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<ExpiringCustomer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [savePath, setSavePath] = useState<string>('')
  const [lastRefresh, setLastRefresh] = useState<string>('')
  const [syncNotice, setSyncNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [autoSync, setAutoSync] = useState(false)
  const [syncCountdown, setSyncCountdown] = useState(SYNC_INTERVAL_SEC)
  const [syncing, setSyncing] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<AppVersionInfo | null>(null)
  const [platformInfo, setPlatformInfo] = useState<ClientPlatformInfo | null>(null)
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [updatingApp, setUpdatingApp] = useState(false)
  const [updateMessage, setUpdateMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [updateProgress, setUpdateProgress] = useState<RendererUpdateProgress | null>(null)
  const autoSyncRef = useRef(autoSync)
  const currentPageRef = useRef(currentPage)
  const loadForwardingRef = useRef<() => Promise<void>>(async () => {})
  const currentAppVersionRef = useRef('')
  const currentPlatformInfoRef = useRef<ClientPlatformInfo | null>(null)
  const dismissedUpdateVersionRef = useRef<string | null>(null)
  autoSyncRef.current = autoSync
  currentPageRef.current = currentPage

  // Auth
  const [authChecked, setAuthChecked] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [userTier, setUserTier] = useState<string>('free')
  const [userEmail, setUserEmail] = useState<string>('')
  const [authNotice, setAuthNotice] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI.getSavePath().then(setSavePath)
  }, [])

  const checkForUpdates = useCallback(async () => {
    try {
      if (!currentAppVersionRef.current) {
        currentAppVersionRef.current = await window.electronAPI.getAppVersion()
      }
      if (!currentPlatformInfoRef.current) {
        currentPlatformInfoRef.current = await window.electronAPI.getPlatformInfo()
      }
      setPlatformInfo(currentPlatformInfoRef.current)
      const latestInfo = await getLatestAppVersion(currentAppVersionRef.current, currentPlatformInfoRef.current)
      setUpdateInfo(latestInfo)
      if (latestInfo.hasUpdate && latestInfo.latestVersion !== dismissedUpdateVersionRef.current) {
        setShowUpdateModal(true)
        setUpdateMessage(null)
      }
    } catch (error: any) {
      console.log('[update] Version check skipped:', error?.message || 'unknown error')
    }
  }, [])

  async function handleInstallUpdate() {
    if (!updateInfo?.downloadUrl) return
    setUpdatingApp(true)
    setUpdateMessage(null)
    setUpdateProgress(null)
    try {
      const result = await window.electronAPI.downloadAndInstallUpdate(updateInfo.downloadUrl)
      setUpdateMessage({ type: 'success', text: result.message })
    } catch (error: any) {
      setUpdateMessage({ type: 'error', text: error.message || '下载更新失败' })
    } finally {
      setUpdatingApp(false)
    }
  }

  async function handleOpenPackageDownload(url: string) {
    if (!url.trim()) return
    try {
      await window.electronAPI.openExternalUrl(url)
    } catch (error: any) {
      setUpdateMessage({ type: 'error', text: error.message || '打开下载地址失败' })
    }
  }

  async function handleOpenOfficialWebsite() {
    try {
      await window.electronAPI.openExternalUrl(OFFICIAL_WEBSITE_URL)
    } catch (error: any) {
      setUpdateMessage({ type: 'error', text: error.message || '打开官网失败' })
    }
  }

  function handleDismissUpdate() {
    dismissedUpdateVersionRef.current = updateInfo?.latestVersion || null
    setShowUpdateModal(false)
    setUpdateMessage(null)
    setUpdateProgress(null)
  }

  const bootstrapCloudData = useCallback(async (user: { userId: number; email: string } | null | undefined) => {
    if (!user) return

    await window.electronAPI.setActiveStorageScope(buildStorageScope(user))

    try {
      await pullNow(buildElectronSyncOptions(() => {
        setRefreshKey(k => k + 1)
        if (currentPageRef.current === 'forwarding') {
          loadForwardingRef.current().catch(() => {})
        }
      }))
      setSyncNotice(null)
    } catch (error: any) {
      setSyncNotice({
        type: 'error',
        text: `已登录 ${user.email}，但云端同步失败：${error?.message || '未知错误'}`
      })
    }
  }, [])

  useEffect(() => {
    const handleUpdateProgress = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail as RendererUpdateProgress : null
      setUpdateProgress(detail)
    }
    window.addEventListener('update-download-progress', handleUpdateProgress as EventListener)
    return () => {
      window.removeEventListener('update-download-progress', handleUpdateProgress as EventListener)
    }
  }, [])

  useEffect(() => {
    const handleSessionInvalid = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : ''
      stopCloudSync()
      window.electronAPI.setActiveStorageScope('guest').catch(() => {})
      setAuthenticated(false)
      setUserEmail('')
      setUserTier('free')
      setCurrentPage('home')
      setAuthNotice(detail || '你的账号已在另一台设备登录，请重新登录。')
    }

    window.addEventListener('auth-session-invalid', handleSessionInvalid as EventListener)
    return () => {
      window.removeEventListener('auth-session-invalid', handleSessionInvalid as EventListener)
    }
  }, [])

  useEffect(() => {
    async function check() {
      const user = await verifyToken()
      if (user) {
        await bootstrapCloudData(user)
        setAuthenticated(true)
        setUserTier(user.tier)
        setUserEmail(user.email)
      }
      setAuthChecked(true)
    }
    check()
  }, [bootstrapCloudData])

  useEffect(() => {
    checkForUpdates()
    const timer = setInterval(() => {
      checkForUpdates()
    }, UPDATE_CHECK_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [checkForUpdates])

  // Load forwarding from orders
  const loadForwarding = useCallback(async () => {
    try {
      const result = await window.electronAPI.fetchForwardingFromOrders()
      setData(result)
      setLastRefresh(new Date().toLocaleString('zh-CN'))
      if (result.expiringCustomers.length > 0 && !selectedCustomer) {
        setSelectedCustomer(result.expiringCustomers[0])
      }
      setRefreshKey(k => k + 1)
    } catch {}
  }, [selectedCustomer])

  useEffect(() => {
    loadForwardingRef.current = loadForwarding
  }, [loadForwarding])

  // Manual Excel import
  function handleRefreshUser() {
    const u = getUser()
    if (u) { setUserTier(u.tier); setUserEmail(u.email) }
  }

  function handleLogout() {
    stopCloudSync()
    apiLogout()
    window.electronAPI.setActiveStorageScope('guest').catch(() => {})
    setAuthenticated(false)
    setUserEmail('')
    setUserTier('free')
    setCurrentPage('home')
    setAuthNotice(null)
  }

  const handleFetch = useCallback(async () => {
    setLoading(true); setError(null); setSyncNotice(null)
    try {
      const result = await window.electronAPI.importExcelFromDialog()
      setData(result)
      setLastRefresh(new Date().toLocaleString('zh-CN'))
      if (result.expiringCustomers.length > 0) {
        setSelectedCustomer(result.expiringCustomers[0])
        setCurrentPage('forwarding')
      }
      setRefreshKey(k => k + 1)
      if (isLoggedIn()) {
        try {
          await syncNow(buildElectronSyncOptions(() => {
            setRefreshKey(k => k + 1)
          }))
          setSyncNotice({ type: 'success', text: '表格导入成功，已同步到云端。' })
        } catch {
          setSyncNotice({ type: 'error', text: '表格导入成功，但同步到云端失败。' })
        }
      } else {
        setSyncNotice({ type: 'error', text: '表格导入成功，但当前未登录，未同步到云端。' })
      }
    } catch (err: any) {
      setError(err.message || '获取数据失败')
    } finally { setLoading(false) }
  }, [])

  const silentFetch = useCallback(async () => {
    setSyncing(true)
    try {
      const result = await window.electronAPI.importExcelFromDialog()
      setData(result); setLastRefresh(new Date().toLocaleString('zh-CN')); setRefreshKey(k => k + 1)
    } catch {} finally { setSyncing(false) }
  }, [])

  // Auto-sync
  useEffect(() => {
    const interval = setInterval(() => {
      if (autoSyncRef.current) { silentFetch(); setSyncCountdown(SYNC_INTERVAL_SEC) }
    }, SYNC_INTERVAL_SEC * 1000)
    const countdown = setInterval(() => {
      setSyncCountdown(prev => { if (!autoSyncRef.current) return prev; if (prev <= 1) return SYNC_INTERVAL_SEC; return prev - 1 })
    }, 1000)
    return () => { clearInterval(interval); clearInterval(countdown) }
  }, [silentFetch])

  useEffect(() => { if (autoSync) setSyncCountdown(SYNC_INTERVAL_SEC) }, [autoSync])

  useEffect(() => {
    if (!authenticated) {
      stopCloudSync()
      return
    }

    startCloudSync({
      ...buildElectronSyncOptions(() => {
        setRefreshKey(k => k + 1)
        if (currentPageRef.current === 'forwarding') {
          loadForwardingRef.current().catch(() => {})
        }
      })
    })

    return () => stopCloudSync()
  }, [authenticated])

  function navigateTo(target: HomeNavigationTarget | TabKey) {
    const nextTarget = typeof target === 'string' ? { tab: target } : target
    if (nextTarget.tab === 'forwarding') loadForwarding()
    setPageIntent(nextTarget)
    setCurrentPage(nextTarget.tab)
  }

  const toolbar = (
    <div className="toolbar" style={{ padding: '0 28px' }}>
      {currentPage !== 'home' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            className="settings-panel__btn settings-panel__btn--secondary"
            onClick={() => { setCurrentPage('home'); setSelectedCustomer(null) }}
            style={{ fontSize: '12px', height: '30px', padding: '0 12px' }}
          >
            ← 返回首页
          </button>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>
            {{ screenshot: '📸 AI 截图录单', orders: '📋 订单管理', inventory: '📦 设备库存', forwarding: '🔄 转寄推荐', shipping: '📮 发货信息', dashboard: '📊 仪表盘', settings: '⚙️ 设置',
      admin: '🔑 管理员',
      friends: '👥 好友代发',
      enterprise: '🏢 企业协作',
      feishu: '🗂️ 飞书同步' }[currentPage] || '功能'}
          </span>
        </div>
      ) : (
        <div />
      )}
      <div className="toolbar__actions" style={{ marginLeft: 'auto' }}>
        <button className="settings-panel__btn settings-panel__btn--secondary" onClick={() => window.electronAPI.openDataFolder()} style={{ fontSize: '11px', height: '30px', padding: '0 10px' }}>
          📂 数据目录
        </button>
        <button className="settings-panel__btn settings-panel__btn--secondary" onClick={handleFetch} disabled={loading} style={{ fontSize: '11px', height: '30px', padding: '0 10px' }}>
          {loading ? '读取中...' : '📥 选择表格导入'}
        </button>
      </div>
    </div>
  )

  const packageOptions = buildUpdatePackageOptions(updateInfo, platformInfo)
  const recommendedPackage = packageOptions.find(option => option.isRecommended) || null
  const alternatePackages = packageOptions.filter(option => !option.isRecommended)

  const updateModal = showUpdateModal && updateInfo ? (
    <div className="dispatch-overlay" onClick={() => { if (!updateInfo.forceUpdate) handleDismissUpdate() }}>
      <div className="dispatch-dialog" onClick={e => e.stopPropagation()} style={{ width: '520px', maxWidth: '92vw' }}>
        <div className="dispatch-dialog__title" style={{ color: updateInfo.forceUpdate ? '#c62828' : '#2e7d32' }}>
          {updateInfo.forceUpdate ? '检测到必须更新的新版本' : '发现新版本'}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <div>当前版本：v{updateInfo.currentVersion}</div>
          <div>最新版本：v{updateInfo.latestVersion}</div>
          <div style={{ marginTop: '6px' }}>
            已识别当前设备：<strong>{formatDetectedPlatform(platformInfo)}</strong>
          </div>
          <div style={{ marginTop: '6px', color: 'var(--text-tertiary)' }}>
            软件会每 1 小时自动检查一次更新，你在使用过程中发布新版本，客户端下一次检测时就会弹窗提醒。
          </div>
        </div>
        {updateInfo.releaseNotes && (
          <div style={{
            marginTop: '14px', padding: '12px 14px', borderRadius: '10px',
            background: updateInfo.forceUpdate ? '#ffebee' : '#f5f7ff',
            color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.8,
            whiteSpace: 'pre-line'
          }}>
            {updateInfo.releaseNotes}
          </div>
        )}
        {updateMessage && (
          <div style={{
            marginTop: '12px', padding: '8px 12px', borderRadius: '8px', fontSize: '12px',
            background: updateMessage.type === 'success' ? '#e8f5e9' : '#ffebee',
            color: updateMessage.type === 'success' ? '#2e7d32' : '#c62828'
          }}>
            {updateMessage.text}
          </div>
        )}
        {updatingApp && (
          <div style={{
            marginTop: '12px',
            padding: '12px 14px',
            borderRadius: '10px',
            background: '#f8fafc',
            border: '1px solid var(--border)'
          }}>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              {getUpdateProgressLabel(updateProgress)}
            </div>
            <div style={{ height: '8px', borderRadius: '999px', background: '#e5e7eb', overflow: 'hidden' }}>
              <div style={{
                width: `${Math.max(8, updateProgress?.percent || 0)}%`,
                height: '100%',
                background: updateInfo.forceUpdate ? '#c62828' : '#2e7d32',
                transition: 'width 0.2s ease'
              }} />
            </div>
          </div>
        )}
        {!updateInfo.downloadUrl && (
          <div style={{
            marginTop: '12px', padding: '8px 12px', borderRadius: '8px', fontSize: '12px',
            background: '#fff8e1', color: '#8d6e63'
          }}>
            当前系统暂时还没有上传对应的安装包，请先在发布页补充这个系统的下载地址。
          </div>
        )}
        {packageOptions.length > 0 && (
          <div style={{
            marginTop: '12px',
            padding: '12px 14px',
            borderRadius: '10px',
            background: '#fafafa',
            border: '1px solid var(--border)'
          }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {recommendedPackage ? `推荐安装包：${recommendedPackage.label}` : '可选安装包'}
            </div>
            {recommendedPackage && (
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                {recommendedPackage.detail}
              </div>
            )}
            {alternatePackages.length > 0 && (
              <>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '10px', marginBottom: '8px' }}>
                  其他版本安装包
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {alternatePackages.map(option => (
                    <button
                      key={option.key}
                      className="settings-panel__btn settings-panel__btn--secondary"
                      onClick={() => handleOpenPackageDownload(option.url)}
                      style={{ fontSize: '12px', height: '30px', padding: '0 10px' }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginTop: '16px' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              className="settings-panel__btn settings-panel__btn--secondary"
              onClick={handleOpenOfficialWebsite}
              style={{ fontSize: '12px', height: '34px' }}
            >
              打开官网
            </button>
            {!updateInfo.forceUpdate && (
              <button
                className="settings-panel__btn settings-panel__btn--secondary"
                onClick={handleDismissUpdate}
                style={{ fontSize: '12px', height: '34px' }}
              >
                稍后提醒
              </button>
            )}
            {updateInfo.forceUpdate && (
              <button
                className="settings-panel__btn settings-panel__btn--secondary"
                onClick={() => window.electronAPI.close()}
                style={{ fontSize: '12px', height: '34px' }}
              >
                退出软件
              </button>
            )}
          </div>
          <button
            className="settings-panel__btn settings-panel__btn--primary"
            onClick={handleInstallUpdate}
            disabled={updatingApp || !updateInfo.downloadUrl}
            style={{
              fontSize: '12px',
              height: '34px',
              background: updateInfo.forceUpdate ? '#c62828' : '#2e7d32',
              borderColor: updateInfo.forceUpdate ? '#c62828' : '#2e7d32',
              color: '#fff'
            }}
          >
            {updatingApp ? '下载安装中...' : updateInfo.forceUpdate ? '立即安装推荐版本' : '安装推荐版本'}
          </button>
        </div>
      </div>
    </div>
  ) : null

  // Auth gate
  if (!authChecked) {
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg-primary)' }}><span style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>加载中...</span></div>
        {updateModal}
      </>
    )
  }
  if (!authenticated) {
    return (
      <>
        <LoginPage onLogin={async () => {
          const u = getUser()
          await bootstrapCloudData(u)
          setAuthenticated(true)
          setUserTier(u?.tier || 'free')
          setUserEmail(u?.email || '')
          setAuthNotice(null)
          setRefreshKey(k => k + 1)
        }} notice={authNotice} />
        {updateModal}
      </>
    )
  }

  return (
    <>
      <TitleBar />
      <div className="app-layout">
        {currentPage === 'forwarding' ? (
          <>
            <Sidebar customers={data?.expiringCustomers || []} selected={selectedCustomer} onSelect={setSelectedCustomer} />
            <div className="main-content">
              {toolbar}
              {error && <div className="error-banner" style={{ whiteSpace: 'pre-line' }}><span>{error}</span><button className="error-banner__close" onClick={() => setError(null)}>x</button></div>}
              {syncNotice && (
                <div className="error-banner" style={{ whiteSpace: 'pre-line', background: syncNotice.type === 'success' ? '#e8f5e9' : '#fff4e5', color: syncNotice.type === 'success' ? '#2e7d32' : '#b26a00' }}>
                  <span>{syncNotice.text}</span>
                  <button className="error-banner__close" onClick={() => setSyncNotice(null)}>x</button>
                </div>
              )}
              <MainContent customer={selectedCustomer} hasData={!!data} />
            </div>
          </>
        ) : (
          <div className="main-content" style={{ flex: 1 }}>
            {toolbar}
            {error && <div className="error-banner" style={{ whiteSpace: 'pre-line' }}><span>{error}</span><button className="error-banner__close" onClick={() => setError(null)}>x</button></div>}
            {syncNotice && (
              <div className="error-banner" style={{ whiteSpace: 'pre-line', background: syncNotice.type === 'success' ? '#e8f5e9' : '#fff4e5', color: syncNotice.type === 'success' ? '#2e7d32' : '#b26a00' }}>
                <span>{syncNotice.text}</span>
                <button className="error-banner__close" onClick={() => setSyncNotice(null)}>x</button>
              </div>
            )}
            {currentPage === 'home' && <HomePage onNavigate={navigateTo} userEmail={userEmail} userTier={userTier} onRefreshUser={handleRefreshUser} onLogout={handleLogout} />}
            {currentPage === 'screenshot' && <ScreenshotOrder />}
            {currentPage === 'dashboard' && <Dashboard key={refreshKey} />}
            {currentPage === 'inventory' && <DeviceInventory key={refreshKey} initialFilter={isInventoryIntent(pageIntent) ? pageIntent.filter : undefined} />}
            {currentPage === 'orders' && <OrderPanel key={refreshKey} initialFilter={isOrderIntent(pageIntent) ? pageIntent.filter : undefined} initialDate={isOrderIntent(pageIntent) ? pageIntent.date : undefined} />}
            {currentPage === 'shipping' && <ShippingInfo key={refreshKey} />}
            {currentPage === 'settings' && <WecomSettings onRefreshUser={handleRefreshUser} />}
            {currentPage === 'admin' && <AdminPanel />}
            {currentPage === 'friends' && <FriendsPage />}
            {currentPage === 'enterprise' && <EnterprisePage />}
            {currentPage === 'feishu' && <FeishuSyncPage />}
          </div>
        )}
      </div>
      <StatusBar lastUpdated={lastRefresh || data?.lastUpdated} customerCount={data?.allCustomers.length} autoSync={autoSync} syncCountdown={syncCountdown} syncing={syncing} />
      {updateModal}
    </>
  )
}
