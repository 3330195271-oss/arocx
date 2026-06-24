import { useState } from 'react'
import {
  generateActivationCodes,
  listActivationCodes,
  getApiBaseUrl,
  getAdminAppVersionConfig,
  publishAppVersion
} from '../services/api-client'

export function AdminPanel(): JSX.Element {
  const [secret, setSecret] = useState('')
  const [authenticated, setAuthenticated] = useState(false)
  const [tab, setTab] = useState<'activation' | 'recharge' | 'release'>('activation')
  const [tier, setTier] = useState<'team' | 'pro'>('team')
  const [count, setCount] = useState(1)
  const [durationDays, setDurationDays] = useState(30)
  const [rechargeCredits, setRechargeCredits] = useState(100)
  const [rechargeCount, setRechargeCount] = useState(1)
  const [codes, setCodes] = useState<string[]>([])
  const [rechargeCodes, setRechargeCodes] = useState<string[]>([])
  const [allCodes, setAllCodes] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [releaseSuccess, setReleaseSuccess] = useState<string | null>(null)
  const [latestVersion, setLatestVersion] = useState('1.0.0')
  const [minimumVersion, setMinimumVersion] = useState('1.0.0')
  const [downloadUrlWindows, setDownloadUrlWindows] = useState('')
  const [downloadUrlMacArm64, setDownloadUrlMacArm64] = useState('')
  const [downloadUrlMacX64, setDownloadUrlMacX64] = useState('')
  const [releaseNotes, setReleaseNotes] = useState('')
  const [publishedAt, setPublishedAt] = useState('')

  function normalizeDateTimeLocal(value?: string | null): string {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    const offset = date.getTimezoneOffset()
    const localDate = new Date(date.getTime() - offset * 60_000)
    return localDate.toISOString().slice(0, 16)
  }

  async function loadReleaseConfig(adminSecret: string) {
    const config = await getAdminAppVersionConfig(adminSecret)
    setLatestVersion(config.latestVersion || '1.0.0')
    setMinimumVersion(config.minimumVersion || config.latestVersion || '1.0.0')
    setDownloadUrlWindows(config.downloadUrlWindows || config.downloadUrl || '')
    setDownloadUrlMacArm64(config.downloadUrlMacArm64 || '')
    setDownloadUrlMacX64(config.downloadUrlMacX64 || '')
    setReleaseNotes(config.releaseNotes || '')
    setPublishedAt(normalizeDateTimeLocal(config.publishedAt))
  }

  async function handleLogin() {
    setLoading(true); setError(null)
    try {
      const result = await listActivationCodes(secret)
      setAllCodes(result.codes)
      await loadReleaseConfig(secret)
      setAuthenticated(true)
    } catch (err: any) { setError(err.message || '密钥错误') }
    finally { setLoading(false) }
  }

  async function handleGenerate() {
    setLoading(true); setError(null); setReleaseSuccess(null)
    try {
      const result = await generateActivationCodes(secret, tier, count, durationDays)
      setCodes(result.codes)
      const listResult = await listActivationCodes(secret)
      setAllCodes(listResult.codes)
    } catch (err: any) { setError(err.message || '生成失败') }
    finally { setLoading(false) }
  }

  async function handleGenerateRecharge() {
    setLoading(true); setError(null); setReleaseSuccess(null)
    try {
      const resp = await fetch(getApiBaseUrl() + '/api/ai-usage/recharge/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminSecret: secret, credits: rechargeCredits, count: rechargeCount })
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error)
      setRechargeCodes(data.codes)
    } catch (err: any) { setError(err.message || '生成失败') }
    finally { setLoading(false) }
  }

  async function handlePublishRelease() {
    setLoading(true); setError(null); setReleaseSuccess(null)
    try {
      const result = await publishAppVersion(secret, {
        latestVersion,
        minimumVersion,
        downloadUrl: downloadUrlWindows,
        downloadUrlWindows,
        downloadUrlMacArm64,
        downloadUrlMacX64,
        releaseNotes,
        publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null
      })
      setLatestVersion(result.config.latestVersion)
      setMinimumVersion(result.config.minimumVersion)
      setDownloadUrlWindows(result.config.downloadUrlWindows || result.config.downloadUrl || '')
      setDownloadUrlMacArm64(result.config.downloadUrlMacArm64 || '')
      setDownloadUrlMacX64(result.config.downloadUrlMacX64 || '')
      setReleaseNotes(result.config.releaseNotes)
      setPublishedAt(normalizeDateTimeLocal(result.config.publishedAt))
      setReleaseSuccess('版本信息已发布，客户端会按系统在下次检查更新时同步对应安装包。')
    } catch (err: any) {
      setError(err.message || '发布失败')
    } finally {
      setLoading(false)
    }
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text)
  }

  if (!authenticated) {
    return (
      <div style={{ padding: '0 28px 20px', overflowY: 'auto', flex: 1 }}>
        <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '16px', marginTop: '4px' }}>🔑 管理员</h3>
        <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '24px', border: '1px solid var(--border)', maxWidth: '400px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px' }}>请输入管理员密钥</p>
          <input className="form-input" style={{ width: '100%', marginBottom: '10px' }} type="password" placeholder="管理员密钥" value={secret} onChange={e => setSecret(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          {error && <div style={{ padding: '8px 12px', background: '#ffebee', borderRadius: '8px', fontSize: '12px', color: '#c62828', marginBottom: '10px' }}>{error}</div>}
          <button className="settings-panel__btn settings-panel__btn--primary" onClick={handleLogin} disabled={loading} style={{ width: '100%', height: '38px' }}>{loading ? '验证中...' : '验证'}</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '0 28px 20px', overflowY: 'auto', flex: 1 }}>
      <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '16px', marginTop: '4px' }}>🔑 激活码管理</h3>

      <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          <button onClick={() => setTab('activation')} style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', background: tab === 'activation' ? 'var(--accent)' : 'var(--border)', color: tab === 'activation' ? '#fff' : 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer' }}>激活码</button>
          <button onClick={() => setTab('recharge')} style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', background: tab === 'recharge' ? '#ff9800' : 'var(--border)', color: tab === 'recharge' ? '#fff' : 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer' }}>充值码</button>
          <button onClick={() => setTab('release')} style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', background: tab === 'release' ? '#4f46e5' : 'var(--border)', color: tab === 'release' ? '#fff' : 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer' }}>软件更新</button>
        </div>

        <div style={{ marginBottom: '14px', padding: '10px 12px', borderRadius: '10px', background: '#eef6ff', color: '#155e75', fontSize: '12px', lineHeight: 1.7 }}>
          飞书同步已经迁移到首页里单独使用，管理员面板不再维护这项配置。
        </div>

        {tab === 'activation' ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label className="form-label">版本</label>
                <select className="form-input" style={{ width: '100%' }} value={tier} onChange={e => setTier(e.target.value as 'team' | 'pro')}>
                  <option value="team">Pro+版 (¥29/月)</option>
                  <option value="pro">Plus版 (¥59/月)</option>
                </select>
              </div>
              <div>
                <label className="form-label">有效天数</label>
                <select className="form-input" style={{ width: '100%' }} value={durationDays} onChange={e => setDurationDays(Number(e.target.value))}>
                  <option value={30}>30 天</option>
                  <option value={90}>90 天</option>
                  <option value={180}>180 天</option>
                  <option value={365}>365 天</option>
                </select>
              </div>
              <div>
                <label className="form-label">生成数量</label>
                <input className="form-input" style={{ width: '100%' }} type="number" min={1} max={100} value={count} onChange={e => setCount(Number(e.target.value))} />
              </div>
            </div>
            {error && <div style={{ padding: '8px 12px', background: '#ffebee', borderRadius: '8px', fontSize: '12px', color: '#c62828', marginBottom: '10px' }}>{error}</div>}
            <button className="settings-panel__btn settings-panel__btn--primary" onClick={handleGenerate} disabled={loading} style={{ fontSize: '13px', height: '36px' }}>{loading ? '生成中...' : '🎫 生成激活码'}</button>
            {codes.length > 0 && (
              <div style={{ marginTop: '14px' }}>
                <div style={{ background: '#e8f5e9', borderRadius: '8px', padding: '12px', fontFamily: 'monospace', fontSize: '13px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginBottom: '8px' }}>{codes.join('\n')}</div>
                <button className="settings-panel__btn settings-panel__btn--secondary" onClick={() => copyToClipboard(codes.join('\n'))} style={{ fontSize: '12px', height: '28px' }}>📋 一键复制</button>
              </div>
            )}
          </>
        ) : tab === 'recharge' ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label className="form-label">每次充值次数</label>
                <select className="form-input" style={{ width: '100%' }} value={rechargeCredits} onChange={e => setRechargeCredits(Number(e.target.value))}>
                  <option value={50}>50 次</option>
                  <option value={100}>100 次</option>
                  <option value={200}>200 次</option>
                  <option value={500}>500 次</option>
                  <option value={1000}>1000 次</option>
                </select>
              </div>
              <div>
                <label className="form-label">生成数量</label>
                <input className="form-input" style={{ width: '100%' }} type="number" min={1} max={100} value={rechargeCount} onChange={e => setRechargeCount(Number(e.target.value))} />
              </div>
            </div>
            {error && <div style={{ padding: '8px 12px', background: '#ffebee', borderRadius: '8px', fontSize: '12px', color: '#c62828', marginBottom: '10px' }}>{error}</div>}
            <button className="settings-panel__btn settings-panel__btn--primary" onClick={handleGenerateRecharge} disabled={loading} style={{ fontSize: '13px', height: '36px', background: '#ff9800' }}>{loading ? '生成中...' : '⚡ 生成充值码'}</button>
            {rechargeCodes.length > 0 && (
              <div style={{ marginTop: '14px' }}>
                <div style={{ background: '#fff3e0', borderRadius: '8px', padding: '12px', fontFamily: 'monospace', fontSize: '13px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginBottom: '8px' }}>{rechargeCodes.join('\n')}</div>
                <button className="settings-panel__btn settings-panel__btn--secondary" onClick={() => copyToClipboard(rechargeCodes.join('\n'))} style={{ fontSize: '12px', height: '28px' }}>📋 一键复制</button>
              </div>
            )}
          </>
        ) : tab === 'release' ? (
          <>
            <div style={{ marginBottom: '12px', padding: '10px 12px', borderRadius: '10px', background: '#f5f7ff', color: '#4f46e5', fontSize: '12px', lineHeight: 1.7 }}>
              发布新版本后，服务器会尽量只保留当前版本对应的安装包，旧版本安装包会自动清理，避免长期占用磁盘空间。
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label className="form-label">最新版本号</label>
                <input className="form-input" style={{ width: '100%' }} value={latestVersion} onChange={e => setLatestVersion(e.target.value)} placeholder="例如 1.2.0" />
              </div>
              <div>
                <label className="form-label">最低支持版本</label>
                <input className="form-input" style={{ width: '100%' }} value={minimumVersion} onChange={e => setMinimumVersion(e.target.value)} placeholder="例如 1.1.0" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Windows 下载地址</label>
                <input className="form-input" style={{ width: '100%' }} value={downloadUrlWindows} onChange={e => setDownloadUrlWindows(e.target.value)} placeholder="https://.../arocx-1.0.4-x64.exe" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Mac 下载地址（Apple 芯片）</label>
                <input className="form-input" style={{ width: '100%' }} value={downloadUrlMacArm64} onChange={e => setDownloadUrlMacArm64(e.target.value)} placeholder="https://.../arocx-1.0.4-arm64-mac.dmg" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Mac 下载地址（Intel，可选）</label>
                <input className="form-input" style={{ width: '100%' }} value={downloadUrlMacX64} onChange={e => setDownloadUrlMacX64(e.target.value)} placeholder="如果暂时没有 Intel 包，可以先留空" />
              </div>
              <div>
                <label className="form-label">发布时间</label>
                <input className="form-input" style={{ width: '100%' }} type="datetime-local" value={publishedAt} onChange={e => setPublishedAt(e.target.value)} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">用户公告内容</label>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>
                  这里的内容会直接展示给用户，请使用用户视角描述，避免写后台配置、服务器地址、管理员操作这类内部信息。
                </div>
                <textarea className="form-input" style={{ width: '100%', minHeight: '96px', resize: 'vertical' }} value={releaseNotes} onChange={e => setReleaseNotes(e.target.value)} placeholder="填写这次更新内容，首页公告和更新弹窗都会直接展示给用户" />
              </div>
            </div>
            {error && <div style={{ padding: '8px 12px', background: '#ffebee', borderRadius: '8px', fontSize: '12px', color: '#c62828', marginBottom: '10px' }}>{error}</div>}
            {releaseSuccess && <div style={{ padding: '8px 12px', background: '#e8f5e9', borderRadius: '8px', fontSize: '12px', color: '#2e7d32', marginBottom: '10px' }}>{releaseSuccess}</div>}
            <button className="settings-panel__btn settings-panel__btn--primary" onClick={handlePublishRelease} disabled={loading} style={{ fontSize: '13px', height: '36px', background: '#4f46e5' }}>{loading ? '发布中...' : '发布版本信息'}</button>
          </>
        ) : null}
      </div>

      <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)' }}>
        <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>激活码记录</h4>
        {allCodes.length === 0 ? (
          <p style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>暂无记录</p>
        ) : (
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px' }}>激活码</th>
                  <th style={{ padding: '6px 8px' }}>版本</th>
                  <th style={{ padding: '6px 8px' }}>天数</th>
                  <th style={{ padding: '6px 8px' }}>状态</th>
                  <th style={{ padding: '6px 8px' }}>使用时间</th>
                </tr>
              </thead>
              <tbody>
                {allCodes.map((c, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)', color: c.used_by ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>
                    <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{c.code}</td>
                    <td style={{ padding: '6px 8px' }}>{c.tier === 'pro' ? 'Plus版' : 'Pro+版'}</td>
                    <td style={{ padding: '6px 8px' }}>{c.duration_days}天</td>
                    <td style={{ padding: '6px 8px' }}>{c.used_by ? <span style={{ color: '#9e9e9e' }}>已使用 (UID:{c.used_by})</span> : <span style={{ color: '#4caf50', fontWeight: 600 }}>可用</span>}</td>
                    <td style={{ padding: '6px 8px' }}>{c.used_at ? new Date(c.used_at).toLocaleString('zh-CN') : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
