import { useEffect, useState } from 'react'
import { bootstrapMyFeishuConfig, getMyFeishuConfig, getUser, saveMyFeishuConfig } from '../services/api-client'
import type { FeishuConfigPayload } from '../services/api-client'
import { FEISHU_SETUP_GUIDE_URL } from '../utils/external-links'

const EMPTY_CONFIG: FeishuConfigPayload = {
  enabled: false,
  appId: '',
  appSecret: '',
  appToken: '',
  tableId: '',
  primaryFieldName: '订单标题',
  baseUrl: ''
}

export function FeishuSyncPage(): JSX.Element {
  const user = getUser()
  const isPlus = user?.tier === 'pro'
  const [config, setConfig] = useState<FeishuConfigPayload>(EMPTY_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [bootstrapping, setBootstrapping] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (!isPlus) {
      setLoading(false)
      return
    }

    getMyFeishuConfig()
      .then(nextConfig => setConfig({ ...EMPTY_CONFIG, ...nextConfig }))
      .catch((error: any) => setMsg({ type: 'error', text: error.message || '读取飞书配置失败' }))
      .finally(() => setLoading(false))
  }, [isPlus])

  function updateConfig<K extends keyof FeishuConfigPayload>(key: K, value: FeishuConfigPayload[K]) {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setMsg(null)
    try {
      const result = await saveMyFeishuConfig({
        ...config,
        appId: config.appId.trim(),
        appSecret: config.appSecret.trim(),
        appToken: config.appToken.trim(),
        tableId: config.tableId.trim(),
        primaryFieldName: (config.primaryFieldName || '订单标题').trim(),
        baseUrl: config.baseUrl.trim()
      })
      setConfig({ ...EMPTY_CONFIG, ...result.config })
      setMsg({ type: 'success', text: '飞书同步配置已保存。' })
    } catch (error: any) {
      setMsg({ type: 'error', text: error.message || '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  async function handleBootstrap() {
    setBootstrapping(true)
    setMsg(null)
    try {
      const result = await bootstrapMyFeishuConfig()
      setConfig({ ...EMPTY_CONFIG, ...result.config })
      setMsg({ type: 'success', text: '飞书表格已自动创建，后续新订单和变更订单会自动同步。' })
    } catch (error: any) {
      setMsg({ type: 'error', text: error.message || '自动建表失败' })
    } finally {
      setBootstrapping(false)
    }
  }

  async function handleOpenGuide() {
    try {
      await window.electronAPI.openExternalUrl(FEISHU_SETUP_GUIDE_URL)
    } catch {
      window.open(FEISHU_SETUP_GUIDE_URL, '_blank', 'noopener,noreferrer')
    }
  }

  if (!isPlus) {
    return (
      <div style={{ padding: '0 28px 20px', overflowY: 'auto', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: '420px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
          <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '8px' }}>飞书同步需要 Plus 版</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', lineHeight: 1.7 }}>
            升级后可以把订单和设备信息同步到你自己的飞书共享表格里，方便团队一起看。
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return <div style={{ padding: '20px', color: 'var(--text-tertiary)', fontSize: '13px' }}>加载中...</div>
  }

  const isReady = Boolean(config.enabled && config.appId && config.appSecret && config.appToken && config.tableId)

  const summaryCards = [
    { label: '同步状态', value: isReady ? '已启用' : '待配置', color: isReady ? '#2e7d32' : '#e67e22' },
    { label: '同步内容', value: '订单 + 设备', color: '#1565c0' },
    { label: '图片上传', value: '已关闭', color: '#6e6e73' }
  ]

  return (
    <div style={{ padding: '0 28px 20px', overflowY: 'auto', flex: 1 }}>
      <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '16px', marginTop: '4px' }}>🗂️ 飞书同步</h3>

      <div style={{ background: 'linear-gradient(135deg, #0f766e, #0f4c81)', borderRadius: '14px', padding: '24px', marginBottom: '16px', color: '#fff' }}>
        <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>把订单同步到你的飞书表格</div>
        <div style={{ fontSize: '12px', opacity: 0.84, lineHeight: 1.7 }}>
          这里只同步设备信息和订单信息，不会上传截图图片。适合给 Plus 用户把业务数据同步到自己的飞书共享表里。
        </div>
        <div style={{ marginTop: '12px', fontSize: '12px', opacity: 0.84 }}>
          当前账号：{user?.email || '-'} {isReady ? '· 已完成连接' : '· 还没有完成绑定'}
        </div>
        <div style={{ marginTop: '14px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            className="settings-panel__btn settings-panel__btn--secondary"
            onClick={handleOpenGuide}
            style={{ fontSize: '12px', height: '34px', background: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.22)', color: '#fff' }}
          >
            查看飞书接入教程
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
        {summaryCards.map(card => (
          <div key={card.label} style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '16px 18px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: '22px', fontWeight: 700, color: card.color }}>{card.value}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{card.label}</div>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', marginBottom: '16px' }}>
        <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>接入前准备</h4>
        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: 1.8, marginBottom: '14px' }}>
          <div>1. 先在飞书开放平台创建企业自建应用。</div>
          <div>2. 开通多维表格相关权限，至少包括创建表格、读取字段、创建字段、更新字段、创建记录、更新记录。</div>
          <div>3. 权限开通后记得发布版本，再回到这里填写 App ID 和 App Secret。</div>
        </div>

        <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>连接飞书应用</h4>
        <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '14px', lineHeight: 1.7 }}>
          先填写飞书开放平台里自建应用的 App ID 和 App Secret。保存后可以直接自动创建订单表，也可以手动填写已有表格的 App Token 和 Table ID。
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
          <div>
            <label className="form-label">App ID</label>
            <input className="form-input" style={{ width: '100%' }} value={config.appId} onChange={e => updateConfig('appId', e.target.value)} placeholder="cli_xxxxxxxxxxxxxxxx" />
          </div>
          <div>
            <label className="form-label">App Secret</label>
            <input className="form-input" style={{ width: '100%' }} type="password" value={config.appSecret} onChange={e => updateConfig('appSecret', e.target.value)} placeholder="填写飞书应用密钥" />
          </div>
          <div>
            <label className="form-label">App Token</label>
            <input className="form-input" style={{ width: '100%' }} value={config.appToken} onChange={e => updateConfig('appToken', e.target.value)} placeholder="自动建表后会自动填充，也可手动填写" />
          </div>
          <div>
            <label className="form-label">Table ID</label>
            <input className="form-input" style={{ width: '100%' }} value={config.tableId} onChange={e => updateConfig('tableId', e.target.value)} placeholder="自动建表后会自动填充，也可手动填写" />
          </div>
          <div>
            <label className="form-label">主标题字段</label>
            <input className="form-input" style={{ width: '100%' }} value={config.primaryFieldName} onChange={e => updateConfig('primaryFieldName', e.target.value)} placeholder="订单标题" />
          </div>
          <div style={{ display: 'flex', alignItems: 'end' }}>
            <label style={{ fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '8px' }}>
              <input type="checkbox" checked={config.enabled} onChange={e => updateConfig('enabled', e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
              启用飞书订单同步
            </label>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">飞书表格地址</label>
            <input className="form-input" style={{ width: '100%' }} value={config.baseUrl} onChange={e => updateConfig('baseUrl', e.target.value)} placeholder="自动建表后会自动填充，也可以粘贴现有飞书多维表格地址" />
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '6px' }}>
              订单创建、发货、归还、转寄等变更会自动写入飞书；截图图片不会上传到服务器，也不会同步到飞书。
            </div>
          </div>
        </div>

        {msg && (
          <div style={{
            marginBottom: '12px', padding: '8px 12px', borderRadius: '8px', fontSize: '12px',
            background: msg.type === 'success' ? '#e8f5e9' : '#ffebee',
            color: msg.type === 'success' ? '#2e7d32' : '#c62828'
          }}>
            {msg.text}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button className="settings-panel__btn settings-panel__btn--primary" onClick={handleSave} disabled={saving} style={{ fontSize: '13px', height: '36px' }}>
            {saving ? '保存中...' : '保存配置'}
          </button>
          <button
            className="settings-panel__btn settings-panel__btn--secondary"
            onClick={handleBootstrap}
            disabled={bootstrapping || !config.appId.trim() || !config.appSecret.trim()}
            style={{ fontSize: '13px', height: '36px' }}
          >
            {bootstrapping ? '处理中...' : '自动创建飞书表'}
          </button>
          {config.baseUrl && (
            <button
              className="settings-panel__btn settings-panel__btn--secondary"
              onClick={() => window.open(config.baseUrl, '_blank', 'noopener,noreferrer')}
              style={{ fontSize: '13px', height: '36px' }}
            >
              打开飞书表格
            </button>
          )}
        </div>
      </div>

      <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)' }}>
        <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>同步说明</h4>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <div>1. 上传到服务器的只有设备信息和订单信息，不包含截图图片。</div>
          <div>2. 飞书里会同步订单号、客户信息、设备型号、发货日、起租日、到期日、发货时间和订单状态。</div>
          <div>3. 你后面在软件里新增、发货、归还、转寄的订单，都会继续自动同步。</div>
        </div>
      </div>
    </div>
  )
}
