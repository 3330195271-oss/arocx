import { useState, useEffect, useRef } from 'react'
import { getApiBaseUrl, setApiBaseUrl, getMySubscription, getSubscriptionPlans, redeemCode, redeemRechargeCode, getProfile, getLatestAppVersion } from '../services/api-client'
import type { SubscriptionInfo, TierInfo, AppVersionInfo, ClientPlatformInfo } from '../services/api-client'
import { buildUpdatePackageOptions, formatDetectedPlatform } from '../utils/update-packages'
import { copySupportEmailToClipboard, OFFICIAL_WEBSITE_URL, SUPPORT_EMAIL, SUPPORT_EMAIL_MAILTO_URL } from '../utils/external-links'
import { getUpdateProgressLabel, type RendererUpdateProgress } from '../utils/update-progress'

interface WecomSettingsProps { onRefreshUser?: () => void }

export function WecomSettings({ onRefreshUser }: WecomSettingsProps): JSX.Element {
  const redeemSectionRef = useRef<HTMLDivElement | null>(null)
  const redeemInputRef = useRef<HTMLInputElement | null>(null)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [channelType, setChannelType] = useState<'wecom' | 'platform'>('wecom')
  const [channelName, setChannelName] = useState('')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [serverUrl, setServerUrl] = useState(getApiBaseUrl())
  const [serverSaved, setServerSaved] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [platformInfo, setPlatformInfo] = useState<ClientPlatformInfo | null>(null)
  const [appVersionInfo, setAppVersionInfo] = useState<AppVersionInfo | null>(null)
  const [updatingApp, setUpdatingApp] = useState(false)
  const [updateMessage, setUpdateMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [updateProgress, setUpdateProgress] = useState<RendererUpdateProgress | null>(null)
  const [contactMessage, setContactMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Subscription
  const [sub, setSub] = useState<SubscriptionInfo | null>(null)
  const [tiers, setTiers] = useState<Record<string, TierInfo>>({})
  const [subLoading, setSubLoading] = useState(true)
  const [redeemInput, setRedeemInput] = useState('')
  const [redeeming, setRedeeming] = useState(false)
  const [redeemMsg, setRedeemMsg] = useState<{type: 'success'|'error', text: string} | null>(null)
  const [rechargeInput, setRechargeInput] = useState('')
  const [recharging, setRecharging] = useState(false)
  const [rechargeMsg, setRechargeMsg] = useState<{type: 'success'|'error', text: string} | null>(null)

      async function handleRecharge() {
    if (!rechargeInput.trim()) return
    setRecharging(true)
    setRechargeMsg(null)
    try {
      const result = await redeemRechargeCode(rechargeInput.trim())
      setRechargeMsg({ type: 'success', text: result.message })
      setRechargeInput('')
      if (onRefreshUser) onRefreshUser()
    } catch (err: any) {
      setRechargeMsg({ type: 'error', text: err.message || '充值失败' })
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
      // Refresh user info
      const profile = await getProfile().catch(() => null)
      if (profile && onRefreshUser) onRefreshUser()
      // Refresh sub info
      const subData = await getMySubscription().catch(() => null)
      if (subData) setSub(subData)
    } catch (err: any) {
      setRedeemMsg({ type: 'error', text: err.message || '兑换失败' })
    } finally {
      setRedeeming(false)
    }
  }

  useEffect(() => {
    const handleUpdateProgress = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail as RendererUpdateProgress : null
      setUpdateProgress(detail)
    }

    window.addEventListener('update-download-progress', handleUpdateProgress as EventListener)

    Promise.all([
      window.electronAPI.getAppVersion(),
      window.electronAPI.getPlatformInfo()
    ]).then(([version, clientPlatform]: [string, ClientPlatformInfo]) => {
      setAppVersion(version)
      setPlatformInfo(clientPlatform)
      getLatestAppVersion(version, clientPlatform).then(setAppVersionInfo).catch(() => {})
    }).catch(() => {})

    window.electronAPI.getWecomConfig().then(config => {
      setWebhookUrl(config.webhookUrl || '')
      setEnabled(config.enabled || false)
      setChannelType(config.channelType || 'wecom')
      setChannelName(config.channelName || '')
      setLoading(false)
    }).catch(() => setLoading(false))

    // Load subscription data
    Promise.all([
      getMySubscription().catch(() => null),
      getSubscriptionPlans().catch(() => ({})),
    ]).then(([subData, tiersData]) => {
      if (subData) setSub(subData)
      setTiers(tiersData as Record<string, TierInfo>)
      setSubLoading(false)
    })
    return () => {
      window.removeEventListener('update-download-progress', handleUpdateProgress as EventListener)
    }
  }, [])

  async function handleSave() {
    await window.electronAPI.saveWecomConfig({
      webhookUrl: webhookUrl.trim(),
      enabled,
      channelType,
      channelName: channelName.trim()
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleSaveServerUrl() {
    setApiBaseUrl(serverUrl.trim())
    setServerSaved(true)
    setTimeout(() => setServerSaved(false), 2000)
    if (appVersion && platformInfo) {
      getLatestAppVersion(appVersion, platformInfo).then(setAppVersionInfo).catch(() => {})
    }
  }

  async function handleInstallUpdate() {
    if (!appVersionInfo?.downloadUrl) return
    setUpdatingApp(true)
    setUpdateMessage(null)
    setUpdateProgress(null)
    try {
      const result = await window.electronAPI.downloadAndInstallUpdate(appVersionInfo.downloadUrl)
      setUpdateMessage({ type: 'success', text: result.message })
    } catch (err: any) {
      setUpdateMessage({ type: 'error', text: err.message || '下载更新失败' })
    } finally {
      setUpdatingApp(false)
    }
  }

  async function handleOpenPackageDownload(url: string) {
    if (!url.trim()) return
    try {
      await window.electronAPI.openExternalUrl(url)
    } catch (err: any) {
      setUpdateMessage({ type: 'error', text: err.message || '打开下载地址失败' })
    }
  }

  async function handleOpenOfficialWebsite() {
    try {
      await window.electronAPI.openExternalUrl(OFFICIAL_WEBSITE_URL)
    } catch (err: any) {
      setUpdateMessage({ type: 'error', text: err.message || '打开官网失败' })
    }
  }

  async function handleContactSupport() {
    try {
      await window.electronAPI.openExternalUrl(SUPPORT_EMAIL_MAILTO_URL)
      setContactMessage({
        type: 'success',
        text: `已打开默认邮件应用，可直接发送到 ${SUPPORT_EMAIL}`
      })
    } catch {
      const copied = await copySupportEmailToClipboard()
      setContactMessage({
        type: copied ? 'success' : 'error',
        text: copied ? `未能直接打开邮件应用，已复制技术支持邮箱：${SUPPORT_EMAIL}` : `技术支持邮箱：${SUPPORT_EMAIL}`
      })
    }
    window.setTimeout(() => setContactMessage(null), 4000)
  }

  function handleJumpToRedeem(tierName: string) {
    setRedeemMsg({
      type: 'success',
      text: `升级到 ${tierName} 需要激活码，已为你定位到下方兑换区域。`
    })
    redeemSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    window.setTimeout(() => redeemInputRef.current?.focus(), 250)
  }

  const tierColors: Record<string, string> = {
    free: '#9e9e9e',
    team: '#2196f3',
    pro: '#ff9800',
  }
  const tierBgColors: Record<string, string> = {
    free: '#f5f5f5',
    team: '#e3f2fd',
    pro: '#fff3e0',
  }
  const packageOptions = buildUpdatePackageOptions(appVersionInfo, platformInfo)
  const recommendedPackage = packageOptions.find(option => option.isRecommended) || null
  const alternatePackages = packageOptions.filter(option => !option.isRecommended)

  if (loading) return <div style={{ padding: '20px', color: 'var(--text-tertiary)', fontSize: '13px' }}>加载中...</div>

  return (
    <div style={{ padding: '0 28px 20px', overflowY: 'auto', flex: 1 }}>
      <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '16px', marginTop: '4px' }}>⚙️ 设置</h3>

      {/* ---- Subscription Plans ---- */}
      {!subLoading && (
        <div style={{
          background: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px',
          border: '1px solid var(--border)', marginBottom: '16px'
        }}>
          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>💎 版本特权</h4>
          <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '16px' }}>
            选择适合你的版本，随时升级
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            {(['free', 'team', 'pro'] as const).map(tierKey => {
              const t = tiers[tierKey]
              if (!t) return null
              const isCurrent = sub?.tier === tierKey
              return (
                <div key={tierKey} style={{
                  background: tierBgColors[tierKey],
                  borderRadius: '10px', padding: '16px',
                  border: isCurrent ? `2px solid ${tierColors[tierKey]}` : '1px solid var(--border)',
                  position: 'relative'
                }}>
                  {isCurrent && (
                    <div style={{
                      position: 'absolute', top: '-8px', right: '12px',
                      background: tierColors[tierKey], color: '#fff',
                      fontSize: '10px', padding: '2px 8px', borderRadius: '10px',
                      fontWeight: 600
                    }}>
                      当前
                    </div>
                  )}
                  <div style={{
                    fontSize: '14px', fontWeight: 700, marginBottom: '4px',
                    color: tierColors[tierKey]
                  }}>
                    {t.name}
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '10px' }}>
                    {t.price}
                  </div>
                  <ul style={{
                    margin: 0, paddingLeft: '16px', fontSize: '11px',
                    color: 'var(--text-secondary)', lineHeight: '1.8'
                  }}>
                    {t.features.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                  {tierKey !== 'free' && !isCurrent && (
                    <button
                      onClick={() => handleJumpToRedeem(t.name)}
                      style={{
                        width: '100%', marginTop: '12px', padding: '8px 0',
                        background: tierColors[tierKey], color: '#fff', border: 'none',
                        borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer'
                      }}
                    >
                      升级到 {t.name}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      
      {/* ---- Redeem Code ---- */}
      <div style={{
        background: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px',
        border: '1px solid var(--border)', marginBottom: '16px'
      }} ref={redeemSectionRef}>
        <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>🎫 激活码兑换</h4>
        <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '12px' }}>
          输入激活码升级到 Pro+ 或 Plus 版
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            ref={redeemInputRef}
            className="form-input"
            style={{ flex: 1 }}
            placeholder="输入激活码，如 RJFK-XXXXXXXX"
            value={redeemInput}
            onChange={e => setRedeemInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRedeem()}
          />
          <button
            className="settings-panel__btn settings-panel__btn--primary"
            onClick={handleRedeem}
            disabled={redeeming || !redeemInput.trim()}
            style={{ fontSize: '13px', height: '36px', whiteSpace: 'nowrap' }}
          >
            {redeeming ? '兑换中...' : '兑换'}
          </button>
        </div>
        {redeemMsg && (
          <div style={{
            marginTop: '10px', padding: '8px 12px', borderRadius: '8px', fontSize: '12px',
            background: redeemMsg.type === 'success' ? '#e8f5e9' : '#ffebee',
            color: redeemMsg.type === 'success' ? '#2e7d32' : '#c62828'
          }}>
            {redeemMsg.text}
          </div>
        )}
      </div>

      
      {/* ---- Recharge Credits ---- */}
      <div style={{
        background: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px',
        border: '1px solid var(--border)', marginBottom: '16px'
      }}>
        <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>⚡ 次数充值</h4>
        <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '12px' }}>
          AI 识别次数用完后，使用充值码补充次数
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            className="form-input"
            style={{ flex: 1 }}
            placeholder="输入充值码，如 RC-XXXXXXXX"
            value={rechargeInput}
            onChange={e => setRechargeInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRecharge()}
          />
          <button
            className="settings-panel__btn settings-panel__btn--primary"
            onClick={handleRecharge}
            disabled={recharging || !rechargeInput.trim()}
            style={{ fontSize: '13px', height: '36px', whiteSpace: 'nowrap' }}
          >
            {recharging ? '充值中...' : '充值'}
          </button>
        </div>
        {rechargeMsg && (
          <div style={{
            marginTop: '10px', padding: '8px 12px', borderRadius: '8px', fontSize: '12px',
            background: rechargeMsg.type === 'success' ? '#e8f5e9' : '#ffebee',
            color: rechargeMsg.type === 'success' ? '#2e7d32' : '#c62828'
          }}>
            {rechargeMsg.text}
          </div>
        )}
      </div>

      {/* ---- Advanced Settings ---- */}
      <div style={{
        background: 'var(--bg-secondary)', borderRadius: '12px',
        border: '1px solid var(--border)', marginBottom: '16px', overflow: 'hidden'
      }}>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{
            width: '100%', padding: '14px 20px', background: 'none', border: 'none',
            fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            color: 'var(--text-primary)'
          }}
        >
          <span>🔧 高级设置</span>
          <span style={{ transform: showAdvanced ? 'rotate(90deg)' : 'none', transition: '0.2s' }}>▶</span>
        </button>

        {showAdvanced && (
          <div style={{ padding: '0 20px 20px' }}>
                        {/* WeCom Webhook */}
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>💬 微信通知</h4>
              <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>
                发货、转寄和业务提醒会发送到企业微信或平台微信 webhook。需要 Pro+ 版订阅。
              </p>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <button onClick={() => setChannelType('wecom')} style={{ padding: '4px 10px', borderRadius: '8px', border: 'none', background: channelType === 'wecom' ? '#0f766e' : 'var(--border)', color: channelType === 'wecom' ? '#fff' : 'var(--text-secondary)', fontSize: '11px', cursor: 'pointer' }}>企业微信</button>
                <button onClick={() => setChannelType('platform')} style={{ padding: '4px 10px', borderRadius: '8px', border: 'none', background: channelType === 'platform' ? '#2563eb' : 'var(--border)', color: channelType === 'platform' ? '#fff' : 'var(--text-secondary)', fontSize: '11px', cursor: 'pointer' }}>平台微信</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                  启用通知
                </label>
              </div>
              {enabled && (
                <div style={{ marginBottom: '8px' }}>
                  <input
                    className="form-input" style={{ width: '100%', marginBottom: '8px' }}
                    placeholder="通道名称，如 发货群 / 平台机器人"
                    value={channelName} onChange={e => setChannelName(e.target.value)}
                  />
                  <input
                    className="form-input" style={{ width: '100%' }}
                    placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
                    value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px', display: 'block' }}>
                    {channelType === 'wecom' ? '企业微信群 -> 群机器人 -> 添加 -> 复制 Webhook 地址' : '填写平台提供的微信 webhook 地址'}
                  </span>
                </div>
              )}
              <button className="settings-panel__btn settings-panel__btn--primary" onClick={handleSave} style={{ fontSize: '12px', height: '30px' }}>
                {saved ? '✅ 已保存' : '保存设置'}
              </button>
            </div>

            {/* Server URL */}
            <div>
              <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>☁️ 云服务器地址</h4>
              <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>
                修改后立即生效。当前：{getApiBaseUrl()}
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  className="form-input" style={{ flex: 1 }}
                  placeholder="http://47.254.36.2:3001"
                  value={serverUrl} onChange={e => setServerUrl(e.target.value)}
                />
                <button className="settings-panel__btn settings-panel__btn--primary" onClick={handleSaveServerUrl} style={{ fontSize: '12px', height: '30px' }}>
                  {serverSaved ? '✅' : '保存'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{
        background: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px',
        border: '1px solid var(--border)', marginBottom: '16px'
      }}>
        <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>🌐 关于 arocx</h4>
        <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '12px', lineHeight: 1.7 }}>
          官网提供产品介绍、安装下载和最新版本说明。遇到问题也可以直接复制技术支持邮箱反馈。
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className="settings-panel__btn settings-panel__btn--secondary"
            onClick={handleOpenOfficialWebsite}
            style={{ fontSize: '12px', height: '34px' }}
          >
            打开官网
          </button>
          <button
            className="settings-panel__btn settings-panel__btn--secondary"
            onClick={handleContactSupport}
            style={{ fontSize: '12px', height: '34px' }}
          >
            技术支持
          </button>
        </div>
        {contactMessage && (
          <div style={{
            marginTop: '12px',
            padding: '10px 12px',
            borderRadius: '10px',
            fontSize: '12px',
            lineHeight: 1.7,
            background: contactMessage.type === 'success' ? '#f1f8e9' : '#fff8e1',
            color: contactMessage.type === 'success' ? '#2e7d32' : '#b26a00',
            border: `1px solid ${contactMessage.type === 'success' ? '#c8e6c9' : '#ffe0b2'}`
          }}>
            {contactMessage.text}
          </div>
        )}
      </div>

      {/* ---- Version ---- */}
      <div style={{
        background: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px',
        border: '1px solid var(--border)'
      }}>
        <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>📋 版本信息</h4>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          当前版本 <strong>v{appVersion || '1.0.0'}</strong>
        </p>
        {appVersionInfo && (
          <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <div>最新版本：v{appVersionInfo.latestVersion}</div>
            <div style={{ marginTop: '4px' }}>
              已识别当前设备：<strong>{formatDetectedPlatform(platformInfo)}</strong>
            </div>
            {appVersionInfo.hasUpdate && (
              <div style={{ marginTop: '8px', padding: '10px 12px', borderRadius: '8px', background: appVersionInfo.forceUpdate ? '#ffebee' : '#e8f5e9', color: appVersionInfo.forceUpdate ? '#c62828' : '#2e7d32' }}>
                <div style={{ fontWeight: 600, marginBottom: appVersionInfo.releaseNotes ? '4px' : 0 }}>
                  {appVersionInfo.forceUpdate ? '检测到必须更新的新版本' : '检测到可更新的新版本'}
                </div>
                {appVersionInfo.releaseNotes && <div style={{ whiteSpace: 'pre-line' }}>{appVersionInfo.releaseNotes}</div>}
                {updatingApp && (
                  <div style={{
                    marginTop: '8px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255,255,255,0.7)',
                    color: 'var(--text-secondary)'
                  }}>
                    <div style={{ fontSize: '12px', marginBottom: '8px' }}>
                      {getUpdateProgressLabel(updateProgress)}
                    </div>
                    <div style={{ height: '8px', borderRadius: '999px', background: '#e5e7eb', overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.max(8, updateProgress?.percent || 0)}%`,
                        height: '100%',
                        background: appVersionInfo.forceUpdate ? '#c62828' : '#2e7d32',
                        transition: 'width 0.2s ease'
                      }} />
                    </div>
                  </div>
                )}
                {packageOptions.length > 0 && (
                  <div style={{
                    marginTop: '8px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255,255,255,0.7)',
                    color: 'var(--text-secondary)'
                  }}>
                    <div style={{ fontWeight: 700 }}>
                      {recommendedPackage ? `推荐安装包：${recommendedPackage.label}` : '可选安装包'}
                    </div>
                    {recommendedPackage && (
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                        {recommendedPackage.detail}
                      </div>
                    )}
                    {alternatePackages.length > 0 && (
                      <>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '8px', marginBottom: '6px' }}>
                          其他版本安装包
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {alternatePackages.map(option => (
                            <button
                              key={option.key}
                              onClick={() => handleOpenPackageDownload(option.url)}
                              style={{
                                padding: '6px 10px',
                                borderRadius: '8px',
                                border: '1px solid var(--border)',
                                background: '#fff',
                                color: 'var(--text-secondary)',
                                fontSize: '12px',
                                cursor: 'pointer'
                              }}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
                {appVersionInfo.downloadUrl && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                    <button
                      onClick={handleInstallUpdate}
                      disabled={updatingApp}
                      style={{
                        padding: '6px 12px', borderRadius: '8px', border: 'none',
                        background: appVersionInfo.forceUpdate ? '#c62828' : '#2e7d32',
                        color: '#fff',
                        cursor: updatingApp ? 'wait' : 'pointer',
                        fontSize: '12px',
                        opacity: updatingApp ? 0.75 : 1
                      }}
                    >
                      {updatingApp ? '下载安装中...' : '安装推荐版本'}
                    </button>
                    <button
                      onClick={handleOpenOfficialWebsite}
                      style={{
                        padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)',
                        background: '#fff',
                        color: 'var(--text-secondary)',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      前往官网
                    </button>
                  </div>
                )}
                {!appVersionInfo.downloadUrl && (
                  <div style={{ marginTop: '8px' }}>
                    当前系统暂时还没有可用的安装包，请联系管理员补充对应系统的下载地址。
                  </div>
                )}
                {updateMessage && (
                  <div style={{ marginTop: '8px', color: updateMessage.type === 'success' ? 'inherit' : '#c62828' }}>
                    {updateMessage.text}
                  </div>
                )}
              </div>
            )}
            {!appVersionInfo.hasUpdate && (
              <div style={{ marginTop: '6px', color: '#2e7d32' }}>已经是最新版本</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
