import { useEffect, useState } from 'react'
import { getAiUsage, getLatestAppVersion, getMySubscription, getProfile, getSubscriptionPlans, isLoggedIn, redeemCode, redeemRechargeCode } from '../services/api-client'
import type { TabKey } from './NavTabs'
import type { DailyStats, InventoryStats } from '../types/customer'
import type { AppVersionInfo, ClientPlatformInfo, SubscriptionInfo, TierInfo } from '../services/api-client'
import type { HomeNavigationTarget } from '../types/home-navigation'
import { copySupportEmailToClipboard, OFFICIAL_WEBSITE_URL, SUPPORT_EMAIL, SUPPORT_EMAIL_MAILTO_URL } from '../utils/external-links'

interface HomePageProps {
  onNavigate: (target: HomeNavigationTarget | TabKey) => void
  userEmail?: string
  userTier?: string
  onRefreshUser?: () => void
  onLogout: () => void
}

function getTodayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatPublishedLabel(value: string | null | undefined): string {
  if (!value) return '刚刚发布'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d} ${hh}:${mm}`
}

function getReleasePreview(notes: string | undefined): string {
  if (!notes) return '当前版本已经发布，点击查看这次更新的详细内容。'
  const firstLine = notes
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean)

  if (!firstLine) return '当前版本已经发布，点击查看这次更新的详细内容。'
  return firstLine.length > 42 ? `${firstLine.slice(0, 42)}...` : firstLine
}

export function HomePage({ onNavigate, userEmail, userTier, onRefreshUser, onLogout }: HomePageProps): JSX.Element {
  const [daily, setDaily] = useState<DailyStats>({ dispatchCount: 0, returnCount: 0, idleStock: 0 })
  const [inv, setInv] = useState<InventoryStats>({ total: 0, idle: 0, renting: 0, returnedToday: 0 })
  const [aiRemaining, setAiRemaining] = useState<number | null>(null)
  const [titleClicks, setTitleClicks] = useState(0)
  const [aiPeriodLabel, setAiPeriodLabel] = useState('今日')
  const [overdueCount, setOverdueCount] = useState(0)
  const [pendingTodayCount, setPendingTodayCount] = useState(0)
  const [expiringCount, setExpiringCount] = useState(0)
  const [appVersionInfo, setAppVersionInfo] = useState<AppVersionInfo | null>(null)
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false)
  const [billingModalTab, setBillingModalTab] = useState<'recharge' | 'upgrade' | null>(null)
  const [rechargeInput, setRechargeInput] = useState('')
  const [recharging, setRecharging] = useState(false)
  const [rechargeMsg, setRechargeMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [plans, setPlans] = useState<Record<string, TierInfo>>({})
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null)
  const [plansLoading, setPlansLoading] = useState(false)
  const [redeemInput, setRedeemInput] = useState('')
  const [redeeming, setRedeeming] = useState(false)
  const [redeemMsg, setRedeemMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [supportMsg, setSupportMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleOpenOfficialWebsite() {
    await window.electronAPI.openExternalUrl(OFFICIAL_WEBSITE_URL)
  }

  async function handleContactSupport() {
    try {
      await window.electronAPI.openExternalUrl(SUPPORT_EMAIL_MAILTO_URL)
      setSupportMsg({
        type: 'success',
        text: `已打开默认邮件应用，可直接发送到 ${SUPPORT_EMAIL}`
      })
    } catch {
      const copied = await copySupportEmailToClipboard()
      setSupportMsg({
        type: copied ? 'success' : 'error',
        text: copied ? `未能直接打开邮件应用，已复制技术支持邮箱：${SUPPORT_EMAIL}` : `技术支持邮箱：${SUPPORT_EMAIL}`
      })
    }
    window.setTimeout(() => setSupportMsg(null), 4000)
  }

  function handleTitleClick() {
    setTitleClicks(prev => {
      if (prev >= 2) { onNavigate('admin'); return 0 }
      return prev + 1
    })
    setTimeout(() => setTitleClicks(0), 2000)
  }

  function openBillingModal(tab: 'recharge' | 'upgrade') {
    setBillingModalTab(tab)
    if (tab === 'recharge') {
      setRechargeMsg(null)
    } else {
      setRedeemMsg(null)
    }
  }

  function refreshAiUsage() {
    if (!isLoggedIn()) return
    getAiUsage().then(u => {
      setAiRemaining(u.remaining)
      setAiPeriodLabel(u.periodType === 'monthly' ? '本月' : '今日')
    }).catch(() => {})
  }

  async function refreshSubscriptionData() {
    setPlansLoading(true)
    try {
      const [subData, tiersData] = await Promise.all([
        getMySubscription().catch(() => null),
        getSubscriptionPlans().catch(() => ({}))
      ])
      if (subData) setSubscriptionInfo(subData)
      setPlans(tiersData as Record<string, TierInfo>)
    } finally {
      setPlansLoading(false)
    }
  }

  async function handleRecharge() {
    if (!rechargeInput.trim()) return
    setRecharging(true)
    setRechargeMsg(null)
    try {
      const result = await redeemRechargeCode(rechargeInput.trim())
      setRechargeMsg({ type: 'success', text: result.message })
      setRechargeInput('')
      refreshAiUsage()
    } catch (error: any) {
      setRechargeMsg({ type: 'error', text: error.message || '充值失败' })
    } finally {
      setRecharging(false)
    }
  }

  async function handleRedeem() {
    if (!redeemInput.trim()) return
    setRedeeming(true)
    setRedeemMsg(null)
    try {
      const result = await redeemCode(redeemInput.trim())
      setRedeemMsg({ type: 'success', text: result.message })
      setRedeemInput('')
      const profile = await getProfile().catch(() => null)
      if (profile && onRefreshUser) onRefreshUser()
      const subData = await getMySubscription().catch(() => null)
      if (subData) setSubscriptionInfo(subData)
    } catch (error: any) {
      setRedeemMsg({ type: 'error', text: error.message || '兑换失败' })
    } finally {
      setRedeeming(false)
    }
  }

  useEffect(() => {
    refreshAiUsage()
    Promise.all([
      window.electronAPI.getAppVersion(),
      window.electronAPI.getPlatformInfo()
    ]).then(([version, platformInfo]: [string, ClientPlatformInfo]) => {
      getLatestAppVersion(version, platformInfo).then(setAppVersionInfo).catch(() => {})
    }).catch(() => {})
    window.electronAPI.getDailyStats().then(setDaily)
    window.electronAPI.getInventoryStats().then(setInv)
    window.electronAPI.getRentingOrders().then(orders => {
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const overdue = orders.filter((o: any) => {
        if (o.status === 'returned' || !o.rentalEnd) return false
        const end = new Date(o.rentalEnd); end.setHours(0, 0, 0, 0)
        return Math.floor((today.getTime() - end.getTime()) / 86400000) > 2
      }).length
      setOverdueCount(overdue)
    }).catch(() => {})
    window.electronAPI.getAllOrders().then(orders => {
      const today = getTodayStr()
      setPendingTodayCount(orders.filter(order => order.status === 'pending' && order.shipmentDate === today).length)
      setExpiringCount(orders.filter(order => {
        if (order.status === 'returned' || !order.rentalEnd) return false
        const end = new Date(order.rentalEnd)
        if (Number.isNaN(end.getTime())) return false
        end.setHours(0, 0, 0, 0)
        const now = new Date(); now.setHours(0, 0, 0, 0)
        const diff = Math.floor((end.getTime() - now.getTime()) / 86400000)
        return diff >= 0 && diff <= 1
      }).length)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (billingModalTab === 'upgrade' && (!subscriptionInfo || Object.keys(plans).length === 0)) {
      refreshSubscriptionData().catch(() => {})
    }
  }, [billingModalTab])

  const primaryModules: { key: TabKey; emoji: string; title: string; desc: string; hero?: boolean; accent?: string }[] = [
    { key: 'screenshot', emoji: '📸', title: 'AI 截图录单', desc: '截图自动识别，秒速录单', hero: true, accent: '#5b3cc4' },
    { key: 'orders', emoji: '📋', title: '订单管理', desc: '查看、发货、归还', accent: '#e67e22' },
    { key: 'inventory', emoji: '📦', title: '设备库存', desc: '序列号管理，状态追踪', accent: '#2e7d32' },
    { key: 'forwarding', emoji: '🔄', title: '转寄推荐', desc: '到期自动匹配，省运费', accent: '#1565c0' },
    { key: 'shipping', emoji: '📮', title: '发货信息', desc: '已发货与转寄记录查询', accent: '#6e6e73' }
  ]

  const supportModules: { key: TabKey; emoji: string; title: string; desc: string; accent?: string }[] = [
    { key: 'enterprise', emoji: '🏢', title: '企业协作', desc: '企业成员共享订单与库存数据', accent: '#0f766e' },
    {
      key: 'feishu',
      emoji: '🗂️',
      title: '飞书同步',
      desc: userTier === 'pro' ? '绑定飞书共享表格，同步订单数据' : 'Plus 专属，绑定飞书共享表格同步订单数据',
      accent: '#0f4c81'
    },
    { key: 'friends', emoji: '👥', title: '好友代发', desc: '把待发货订单分享给好友帮忙发', accent: '#7b1fa2' },
    { key: 'settings', emoji: '⚙️', title: '设置', desc: '账号、升级与偏好配置', accent: '#8e8e93' }
  ]
  const helpActions: { key: 'about' | 'support'; emoji: string; title: string; desc: string; accent: string; onClick: () => Promise<void> }[] = [
    {
      key: 'about',
      emoji: '🌐',
      title: '关于我们',
      desc: '查看官网、下载地址与产品介绍',
      accent: '#3156d3',
      onClick: handleOpenOfficialWebsite
    },
    {
      key: 'support',
      emoji: '🛟',
      title: '技术支持',
      desc: '直接打开邮件反馈窗口，遇到问题随时联系',
      accent: '#0f766e',
      onClick: handleContactSupport
    }
  ]

  const tierNames: Record<string, string> = { free: '免费版', team: 'Pro+版', pro: 'Plus版' }
  const tierBadgeColors: Record<string, string> = { free: '#9e9e9e', team: '#2196f3', pro: '#ff9800' }
  const tierBgColors: Record<string, string> = { free: '#f5f5f5', team: '#e3f2fd', pro: '#fff3e0' }
  const upgradeButtonLabel = userTier === 'pro' ? '版本权益' : userTier === 'team' ? '升级 Plus' : '升级版本'
  const quickLinks = [
    {
      title: '今日待发货',
      value: pendingTodayCount,
      desc: '直接进入订单管理并筛出今天待处理的单子',
      accent: '#e67e22',
      target: { tab: 'orders', filter: 'pending', date: getTodayStr() } as const
    },
    {
      title: '即将到期',
      value: expiringCount,
      desc: '直接查看最近到期、需要跟进的租期订单',
      accent: '#1565c0',
      target: { tab: 'orders', filter: 'expiring' } as const
    },
    {
      title: '空闲库存',
      value: inv.idle,
      desc: '进入设备库存并只看当前空闲可用的设备',
      accent: '#2e7d32',
      target: { tab: 'inventory', filter: 'idle' } as const
    },
    {
      title: '租用中',
      value: inv.renting,
      desc: '进入设备库存并查看正在租用中的设备',
      accent: '#5b3cc4',
      target: { tab: 'inventory', filter: 'renting' } as const
    }
  ]

  const overviewCards = [
    { label: '总设备', value: inv.total, color: '#1d1d1f' },
    { label: '今日发货', value: daily.dispatchCount, color: '#e67e22' },
    { label: '今日归还', value: daily.returnCount, color: '#2e7d32' },
    { label: '已逾期', value: overdueCount, color: overdueCount > 0 ? '#e53935' : '#666' }
  ]
  const announcementPreview = getReleasePreview(appVersionInfo?.releaseNotes)
  const announcementPublishedAt = formatPublishedLabel(appVersionInfo?.publishedAt)
  const showAnnouncementCard = Boolean(appVersionInfo && (appVersionInfo.releaseNotes || appVersionInfo.hasUpdate || appVersionInfo.publishedAt))

  return (
    <div style={{ padding: '28px 32px', overflowY: 'auto', flex: 1 }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '20px', background: 'var(--bg-secondary)',
          borderRadius: '14px', padding: '16px 20px', border: '1px solid var(--border)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--accent), #7c4dff)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: '18px', fontWeight: 600, flexShrink: 0
          }}>
            {userEmail ? userEmail.charAt(0).toUpperCase() : '?'}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>{userEmail || '未登录'}</div>
              {aiRemaining !== null && (
                <div style={{
                  fontSize: '12px', fontWeight: 500, color: '#1d1d1f',
                  background: '#f5f5f5', padding: '2px 10px', borderRadius: '10px',
                  display: 'flex', alignItems: 'center', gap: '4px',
                  cursor: 'pointer'
                }}>
                  <button
                    onClick={() => openBillingModal('recharge')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      background: 'none', border: 'none', padding: 0,
                      cursor: 'pointer', color: 'inherit', fontSize: '12px', fontWeight: 500
                    }}
                    title="点击直接充值 AI 次数"
                  >
                    🤖 {aiPeriodLabel}剩余 <strong>{aiRemaining}</strong> 次
                  </button>
                </div>
              )}
            </div>
            {userTier && (
              <button
                onClick={() => openBillingModal('upgrade')}
                style={{
                  display: 'inline-block', marginTop: '2px',
                  background: tierBadgeColors[userTier] || tierBadgeColors.free,
                  color: '#fff', fontSize: '10px', fontWeight: 600,
                  padding: '1px 8px', borderRadius: '10px',
                  border: 'none', cursor: 'pointer'
                }}
                title="点击查看版本权益和升级方式"
              >
                {tierNames[userTier] || '免费版'}
              </button>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => openBillingModal('upgrade')}
            style={{
              background: '#4f46e5', border: '1px solid #4f46e5',
              color: '#fff', fontSize: '12px', fontWeight: 600,
              padding: '6px 14px', borderRadius: '8px', cursor: 'pointer'
            }}
          >
            {upgradeButtonLabel}
          </button>
          <button
            onClick={() => openBillingModal('recharge')}
            style={{
              background: '#ff9800', border: '1px solid #ff9800',
              color: '#fff', fontSize: '12px', fontWeight: 600,
              padding: '6px 14px', borderRadius: '8px', cursor: 'pointer'
            }}
          >
            充值次数
          </button>
          <button
            onClick={() => onNavigate('settings')}
            style={{
              background: 'none', border: '1px solid var(--border)',
              color: 'var(--text-secondary)', fontSize: '12px',
              padding: '6px 14px', borderRadius: '8px', cursor: 'pointer'
            }}
          >
            设置
          </button>
          <button
            onClick={onLogout}
            style={{
              background: 'none', border: '1px solid var(--border)',
              color: 'var(--text-tertiary)', fontSize: '12px',
              padding: '6px 14px', borderRadius: '8px', cursor: 'pointer'
            }}
            title="退出登录"
          >
            退出
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, cursor: 'default', userSelect: 'none' }} onClick={handleTitleClick}>arocx</h1>
        <p style={{ fontSize: '14px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
          今日发货 {daily.dispatchCount} 单 · 归还 {daily.returnCount} 单 · 空闲设备 {inv.idle} 台
        </p>
        {userTier !== 'pro' && (
          <div
            onClick={() => openBillingModal('upgrade')}
            style={{
              marginTop: '14px',
              padding: '14px 16px',
              borderRadius: '12px',
              border: '1px solid #d8dcff',
              background: 'linear-gradient(135deg, #f5f3ff 0%, #eef4ff 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '14px',
              cursor: 'pointer'
            }}
          >
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#4338ca' }}>
                {userTier === 'team' ? '升级到 Plus，开启飞书同步和更高权限' : '开通版本，解锁更多业务能力'}
              </div>
              <div style={{ fontSize: '12px', color: '#5b5f97', marginTop: '4px', lineHeight: 1.6 }}>
                {userTier === 'team'
                  ? '输入激活码即可升级，飞书共享表格、多客服协作这些能力会更容易卖出去。'
                  : '用户在这里可以直接输入激活码，开通 Pro+ 或继续升级到 Plus。'}
              </div>
            </div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#4f46e5', whiteSpace: 'nowrap' }}>
              立即查看 →
            </div>
          </div>
        )}
        {showAnnouncementCard && (
          <div
            onClick={() => setShowAnnouncementModal(true)}
            style={{
              marginTop: '14px',
              padding: '14px 16px',
              borderRadius: '12px',
              border: `1px solid ${appVersionInfo?.forceUpdate ? '#ffcdd2' : '#d9e4ff'}`,
              background: appVersionInfo?.forceUpdate
                ? 'linear-gradient(135deg, #fff5f5 0%, #fff0f0 100%)'
                : 'linear-gradient(135deg, #f8fbff 0%, #f3f7ff 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              cursor: 'pointer'
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: appVersionInfo?.forceUpdate ? '#c62828' : '#3156d3' }}>
                  更新公告
                </span>
                <span style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: appVersionInfo?.forceUpdate ? '#c62828' : appVersionInfo?.hasUpdate ? '#2e7d32' : '#5f6368',
                  background: appVersionInfo?.forceUpdate ? '#ffebee' : appVersionInfo?.hasUpdate ? '#e8f5e9' : '#eef2f7',
                  padding: '2px 8px',
                  borderRadius: '999px'
                }}>
                  {appVersionInfo?.forceUpdate ? '必须更新' : appVersionInfo?.hasUpdate ? '发现新版本' : `v${appVersionInfo?.latestVersion}`}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                  {announcementPublishedAt}
                </span>
              </div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '6px' }}>
                {announcementPreview}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                版本 v{appVersionInfo?.latestVersion} · 点击查看完整更新内容
              </div>
            </div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: appVersionInfo?.forceUpdate ? '#c62828' : '#3156d3', whiteSpace: 'nowrap' }}>
              查看详情 →
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          marginBottom: '28px',
          background: 'var(--bg-secondary)',
          borderRadius: '14px',
          border: '1px solid var(--border)',
          padding: '18px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 600 }}>今日待办</div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>从这里直接进入正在处理的事情，不用再进页面后二次筛选。</div>
          </div>
          <button
            onClick={() => onNavigate('dashboard')}
            style={{
              background: 'none', border: '1px solid var(--border)', color: 'var(--accent)',
              fontSize: '12px', fontWeight: 600, padding: '7px 12px', borderRadius: '8px', cursor: 'pointer'
            }}
          >
            查看完整仪表盘
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '12px' }}>
          {quickLinks.map(item => (
            <div key={item.title} style={{
              background: 'var(--bg-primary)',
              borderRadius: '12px',
              padding: '16px 18px',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onClick={() => onNavigate(item.target)}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = item.accent
              e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.06)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.boxShadow = 'none'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'start' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{item.title}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px', lineHeight: 1.5 }}>{item.desc}</div>
                </div>
                <div style={{ fontSize: '16px', color: item.accent }}>→</div>
              </div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: item.accent, marginTop: '12px' }}>{item.value}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {overviewCards.map(item => (
            <div key={item.label} style={{
              flex: 1, background: '#fafafa', borderRadius: '10px',
              padding: '12px 14px', border: '1px solid var(--border)'
            }}>
              <div style={{ fontSize: '20px', fontWeight: 700, color: item.color }}>{item.value}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '14px' }}>
        <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>开始工作</div>
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>高频功能放前面，进来就能直接处理订单、库存和转寄。</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '24px' }}>
        {primaryModules.map(m => (
          <div
            key={m.key}
            onClick={() => onNavigate(m.key)}
            style={{
              background: m.hero
                ? 'linear-gradient(135deg, #f5f0ff 0%, #eef3ff 100%)'
                : 'var(--bg-secondary)',
              borderRadius: '14px',
              padding: m.hero ? '24px' : '20px',
              border: m.hero ? '1.5px solid #d4c5f9' : '1px solid var(--border)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              gridColumn: m.hero ? '1 / -1' : undefined,
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              position: 'relative',
              overflow: 'hidden'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = ''
              e.currentTarget.style.boxShadow = ''
            }}
          >
            {m.hero && (
              <div style={{
                position: 'absolute', top: '-20px', right: '-20px',
                width: '100px', height: '100px', borderRadius: '50%',
                background: 'rgba(91,60,196,0.06)', pointerEvents: 'none'
              }} />
            )}
            <div style={{
              width: m.hero ? '56px' : '44px', height: m.hero ? '56px' : '44px',
              borderRadius: '12px', background: (m.accent || '#f0f0f2') + '1a',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: m.hero ? '28px' : '22px', flexShrink: 0
            }}>
              {m.emoji}
            </div>
            <div>
              <div style={{
                fontSize: m.hero ? '17px' : '14px', fontWeight: 600,
                color: m.hero ? '#4a2d9e' : 'var(--text-primary)'
              }}>
                {m.title}
                {m.hero && (
                  <span style={{
                    fontSize: '10px', fontWeight: 600, color: '#fff', background: '#5b3cc4',
                    padding: '2px 8px', borderRadius: '10px', marginLeft: '8px', verticalAlign: 'middle'
                  }}>核心功能</span>
                )}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{m.desc}</div>
            </div>
            <div style={{ marginLeft: 'auto', color: 'var(--text-tertiary)', fontSize: '18px' }}>→</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: '14px' }}>
        <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>协作与配置</div>
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>通知、协作和账号设置单独放一起，找起来更顺手。</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
        {supportModules.map(m => (
          <div
            key={m.key}
            onClick={() => onNavigate(m.key)}
            style={{
              background: 'var(--bg-secondary)',
              borderRadius: '14px',
              padding: '20px',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '16px'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = ''
              e.currentTarget.style.boxShadow = ''
            }}
          >
            <div style={{
              width: '44px', height: '44px',
              borderRadius: '12px', background: (m.accent || '#f0f0f2') + '1a',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '22px', flexShrink: 0
            }}>
              {m.emoji}
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>{m.title}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{m.desc}</div>
            </div>
            <div style={{ marginLeft: 'auto', color: 'var(--text-tertiary)', fontSize: '18px' }}>→</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '24px', marginBottom: '14px' }}>
        <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>帮助与联系</div>
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>官网、安装说明和问题反馈入口都放在这里，客户更容易找到。</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
        {helpActions.map(action => (
          <div
            key={action.key}
            onClick={() => {
              action.onClick().catch(() => {})
            }}
            style={{
              background: 'var(--bg-secondary)',
              borderRadius: '14px',
              padding: '20px',
              border: '1px solid var(--border)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '16px'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = ''
              e.currentTarget.style.boxShadow = ''
            }}
          >
            <div style={{
              width: '44px', height: '44px',
              borderRadius: '12px', background: `${action.accent}1a`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '22px', flexShrink: 0
            }}>
              {action.emoji}
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>{action.title}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{action.desc}</div>
            </div>
            <div style={{ marginLeft: 'auto', color: 'var(--text-tertiary)', fontSize: '18px' }}>→</div>
          </div>
        ))}
      </div>

      {supportMsg && (
        <div
          style={{
            marginTop: '12px',
            padding: '12px 14px',
            borderRadius: '12px',
            border: `1px solid ${supportMsg.type === 'success' ? '#c8e6c9' : '#ffe0b2'}`,
            background: supportMsg.type === 'success' ? '#f1f8e9' : '#fff8e1',
            color: supportMsg.type === 'success' ? '#2e7d32' : '#b26a00',
            fontSize: '12px',
            lineHeight: 1.7
          }}
        >
          {supportMsg.text}
        </div>
      )}

      {billingModalTab && (
        <div className="dispatch-overlay" onClick={() => setBillingModalTab(null)}>
          <div className="dispatch-dialog" onClick={e => e.stopPropagation()} style={{ width: '680px', maxWidth: '92vw' }}>
            <div className="dispatch-dialog__title" style={{ color: billingModalTab === 'upgrade' ? '#4f46e5' : '#ff9800' }}>
              {billingModalTab === 'upgrade' ? '💎 版本升级' : '⚡ 次数充值'}
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              <button
                onClick={() => setBillingModalTab('upgrade')}
                style={{
                  padding: '6px 14px', borderRadius: '8px', border: 'none',
                  background: billingModalTab === 'upgrade' ? '#4f46e5' : 'var(--border)',
                  color: billingModalTab === 'upgrade' ? '#fff' : 'var(--text-secondary)',
                  fontSize: '12px', cursor: 'pointer'
                }}
              >
                版本升级
              </button>
              <button
                onClick={() => setBillingModalTab('recharge')}
                style={{
                  padding: '6px 14px', borderRadius: '8px', border: 'none',
                  background: billingModalTab === 'recharge' ? '#ff9800' : 'var(--border)',
                  color: billingModalTab === 'recharge' ? '#fff' : 'var(--text-secondary)',
                  fontSize: '12px', cursor: 'pointer'
                }}
              >
                次数充值
              </button>
            </div>

            {billingModalTab === 'recharge' ? (
              <>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: 1.7, marginBottom: '14px' }}>
                  不用再进设置页，直接在这里输入充值码补充 AI 识别次数。
                  {aiRemaining !== null && <span> 当前剩余 {aiRemaining} 次。</span>}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    className="form-input"
                    style={{ flex: 1 }}
                    placeholder="输入充值码，如 RC-XXXXXXXX"
                    value={rechargeInput}
                    onChange={e => setRechargeInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleRecharge()}
                    autoFocus
                  />
                  <button
                    className="settings-panel__btn settings-panel__btn--primary"
                    onClick={handleRecharge}
                    disabled={recharging || !rechargeInput.trim()}
                    style={{ fontSize: '13px', height: '36px', whiteSpace: 'nowrap', background: '#ff9800' }}
                  >
                    {recharging ? '充值中...' : '立即充值'}
                  </button>
                </div>
                {rechargeMsg && (
                  <div style={{
                    marginTop: '12px', padding: '8px 12px', borderRadius: '8px', fontSize: '12px',
                    background: rechargeMsg.type === 'success' ? '#e8f5e9' : '#ffebee',
                    color: rechargeMsg.type === 'success' ? '#2e7d32' : '#c62828'
                  }}>
                    {rechargeMsg.text}
                  </div>
                )}
              </>
            ) : (
              <>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: 1.7, marginBottom: '14px' }}>
                  想升级版本的用户可以直接在这里输入激活码，不用再绕去设置页找入口。
                </div>
                {!plansLoading && Object.keys(plans).length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '14px' }}>
                    {(['free', 'team', 'pro'] as const).map(tierKey => {
                      const plan = plans[tierKey]
                      if (!plan) return null
                      const isCurrent = subscriptionInfo?.tier === tierKey
                      return (
                        <div
                          key={tierKey}
                          style={{
                            background: tierBgColors[tierKey],
                            borderRadius: '10px',
                            padding: '14px',
                            border: isCurrent ? `2px solid ${tierBadgeColors[tierKey]}` : '1px solid var(--border)',
                            position: 'relative'
                          }}
                        >
                          {isCurrent && (
                            <div style={{
                              position: 'absolute', top: '-8px', right: '12px',
                              background: tierBadgeColors[tierKey], color: '#fff',
                              fontSize: '10px', padding: '2px 8px', borderRadius: '10px', fontWeight: 600
                            }}>
                              当前
                            </div>
                          )}
                          <div style={{ fontSize: '14px', fontWeight: 700, color: tierBadgeColors[tierKey], marginBottom: '4px' }}>
                            {plan.name}
                          </div>
                          <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '10px' }}>
                            {plan.price}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                            {plan.features.slice(0, 4).map(feature => (
                              <div key={feature}>• {feature}</div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                {plansLoading && (
                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '14px' }}>加载版本权益中...</div>
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    className="form-input"
                    style={{ flex: 1 }}
                    placeholder="输入激活码，如 RJFK-XXXXXXXX"
                    value={redeemInput}
                    onChange={e => setRedeemInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleRedeem()}
                    autoFocus
                  />
                  <button
                    className="settings-panel__btn settings-panel__btn--primary"
                    onClick={handleRedeem}
                    disabled={redeeming || !redeemInput.trim()}
                    style={{ fontSize: '13px', height: '36px', whiteSpace: 'nowrap', background: '#4f46e5' }}
                  >
                    {redeeming ? '兑换中...' : '立即升级'}
                  </button>
                </div>
                {redeemMsg && (
                  <div style={{
                    marginTop: '12px', padding: '8px 12px', borderRadius: '8px', fontSize: '12px',
                    background: redeemMsg.type === 'success' ? '#e8f5e9' : '#ffebee',
                    color: redeemMsg.type === 'success' ? '#2e7d32' : '#c62828'
                  }}>
                    {redeemMsg.text}
                  </div>
                )}
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', gap: '12px' }}>
              <button
                className="settings-panel__btn settings-panel__btn--secondary"
                onClick={() => setBillingModalTab(null)}
                style={{ fontSize: '12px', height: '32px' }}
              >
                关闭
              </button>
              <button
                className="settings-panel__btn settings-panel__btn--secondary"
                onClick={() => {
                  setBillingModalTab(null)
                  onNavigate('settings')
                }}
                style={{ fontSize: '12px', height: '32px' }}
              >
                去设置页查看更多
              </button>
            </div>
          </div>
        </div>
      )}

      {showAnnouncementModal && appVersionInfo && (
        <div className="dispatch-overlay" onClick={() => setShowAnnouncementModal(false)}>
          <div className="dispatch-dialog" onClick={e => e.stopPropagation()} style={{ width: '720px', maxWidth: '92vw' }}>
            <div className="dispatch-dialog__title" style={{ color: appVersionInfo.forceUpdate ? '#c62828' : '#3156d3' }}>
              更新公告
            </div>

            <div style={{
              padding: '14px 16px',
              borderRadius: '12px',
              background: appVersionInfo.forceUpdate ? '#fff5f5' : '#f8fbff',
              border: `1px solid ${appVersionInfo.forceUpdate ? '#ffcdd2' : '#d9e4ff'}`,
              marginBottom: '14px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  v{appVersionInfo.latestVersion}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                    发布时间：{announcementPublishedAt}
                  </span>
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: appVersionInfo.forceUpdate ? '#c62828' : appVersionInfo.hasUpdate ? '#2e7d32' : '#5f6368',
                    background: appVersionInfo.forceUpdate ? '#ffebee' : appVersionInfo.hasUpdate ? '#e8f5e9' : '#eef2f7',
                    padding: '2px 8px',
                    borderRadius: '999px'
                  }}>
                    {appVersionInfo.forceUpdate ? '必须更新' : appVersionInfo.hasUpdate ? '可更新' : '当前已同步'}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '6px', lineHeight: 1.7 }}>
                当前版本 v{appVersionInfo.currentVersion}，最低支持版本 v{appVersionInfo.minimumVersion}
              </div>
            </div>

            <div style={{
              padding: '16px',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              background: 'var(--bg-secondary)',
              whiteSpace: 'pre-line',
              fontSize: '13px',
              lineHeight: 1.8,
              color: 'var(--text-primary)',
              maxHeight: '360px',
              overflowY: 'auto'
            }}>
              {appVersionInfo.releaseNotes || '当前版本暂时还没有填写详细更新说明。'}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', gap: '12px' }}>
              <button
                className="settings-panel__btn settings-panel__btn--secondary"
                onClick={() => setShowAnnouncementModal(false)}
                style={{ fontSize: '12px', height: '32px' }}
              >
                关闭
              </button>
              {appVersionInfo.hasUpdate && (
                <button
                  className="settings-panel__btn settings-panel__btn--primary"
                  onClick={() => {
                    setShowAnnouncementModal(false)
                    onNavigate('settings')
                  }}
                  style={{
                    fontSize: '12px',
                    height: '32px',
                    background: appVersionInfo.forceUpdate ? '#c62828' : '#3156d3',
                    borderColor: appVersionInfo.forceUpdate ? '#c62828' : '#3156d3'
                  }}
                >
                  去版本页查看更新
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
