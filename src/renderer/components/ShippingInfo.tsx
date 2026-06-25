import { useEffect, useState, useMemo } from 'react'
import type { Order } from '../types/customer'
import { forwardEnterpriseOrder, returnEnterpriseOrder } from '../services/api-client'
import {
  getEnterpriseWorkspaceInfo,
  loadEnterpriseOrders,
  type WorkspaceOrder
} from '../services/enterprise-workspace'
import { syncOrdersAfterMutation } from '../services/order-change-sync'
import { buildElectronSyncOptions, pullNow } from '../services/sync-service'

const PAGE_SIZE = 10

export function ShippingInfo(): JSX.Element {
  const [allOrders, setAllOrders] = useState<WorkspaceOrder[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [enterpriseMode, setEnterpriseMode] = useState(false)
  const [enterpriseName, setEnterpriseName] = useState('')

  // Forward modal state
  const [forwardSource, setForwardSource] = useState<WorkspaceOrder | null>(null)
  const [targetSearch, setTargetSearch] = useState('')
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null)
  const [forwardTracking, setForwardTracking] = useState('')
  const [forwarding, setForwarding] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      const workspace = await getEnterpriseWorkspaceInfo()
      if (cancelled) return
      setEnterpriseMode(workspace.enabled)
      setEnterpriseName(workspace.enterpriseName)
      await reload(workspace.enabled)
    }

    bootstrap().catch(() => {})
    return () => { cancelled = true }
  }, [])

  function isOverdue(order: Order): boolean {
    if (order.status === 'returned') return false
    if (!order.rentalEnd) return false
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const end = new Date(order.rentalEnd); end.setHours(0, 0, 0, 0)
    return Math.floor((today.getTime() - end.getTime()) / 86400000) > 2
  }

  async function reload(useEnterpriseMode = enterpriseMode) {
    const nextOrders = useEnterpriseMode
      ? await loadEnterpriseOrders()
      : await window.electronAPI.getAllOrders()
    setAllOrders(nextOrders)
  }

  async function refreshAfterEnterpriseMutation() {
    try {
      await pullNow(buildElectronSyncOptions())
    } catch {
      // Enterprise shipping list is fetched from server directly.
    }
    await reload(true)
  }

  async function handleReturn(orderId: string) {
    if (enterpriseMode) {
      await returnEnterpriseOrder(orderId)
      await refreshAfterEnterpriseMutation()
      return
    }

    await window.electronAPI.returnOrder(orderId)
    await syncOrdersAfterMutation()
    await reload()
  }

  async function handleForward() {
    if (!forwardSource || !selectedTargetId || !forwardTracking.trim()) return
    setForwarding(true)
    try {
      if (enterpriseMode) {
        await forwardEnterpriseOrder(forwardSource.id, selectedTargetId, forwardTracking.trim())
        await refreshAfterEnterpriseMutation()
      } else {
        await window.electronAPI.forwardOrder(forwardSource.id, selectedTargetId, forwardTracking.trim())
        await syncOrdersAfterMutation()
      }
      setForwardSource(null)
      setSelectedTargetId(null)
      setForwardTracking('')
      setTargetSearch('')
      await reload(enterpriseMode)
    } catch (err: any) {
      alert(err.message || '转寄失败')
    } finally {
      setForwarding(false)
    }
  }

  // Show dispatched + returned orders (full shipping history)
  const shippingOrders = useMemo(() => {
    let list = allOrders.filter(o => o.status === 'dispatched' || o.status === 'returned')
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(o =>
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.includes(q) ||
        o.csRep.toLowerCase().includes(q) ||
        o.serialNumber.toLowerCase().includes(q) ||
        o.trackingNumber.toLowerCase().includes(q) ||
        (o.ownerEmail || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [allOrders, searchQuery])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(shippingOrders.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pagedOrders = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return shippingOrders.slice(start, start + PAGE_SIZE)
  }, [shippingOrders, safePage])

  // Target customers for forwarding (all non-returned orders, for selection)
  const forwardTargets = useMemo(() => {
    if (!forwardSource) return []
    let list = allOrders.filter(o =>
      o.status !== 'returned' &&
      o.id !== forwardSource.id &&
      o.deviceId === forwardSource.deviceId
    )
    if (targetSearch.trim()) {
      const q = targetSearch.trim().toLowerCase()
      list = list.filter(o =>
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.includes(q) ||
        (o.shipmentDate || '').includes(q)
      )
    }
    return list.slice(0, 50) // limit for performance
  }, [allOrders, forwardSource, targetSearch])

  function getForwardInfo(order: WorkspaceOrder): string | null {
    if (order.forwardedFromOrderId) {
      const source = allOrders.find(o => o.id === order.forwardedFromOrderId)
      if (source) return `← 由「${source.customerName}」转寄`
      return '← 转寄订单'
    }
    if (order.forwardedToOrderId) {
      const target = allOrders.find(o => o.id === order.forwardedToOrderId)
      if (target) return `→ 转寄给「${target.customerName}」`
      return '→ 已转寄'
    }
    return null
  }

  return (
    <div className="order-panel" style={{ padding: '0 28px 20px', overflowY: 'auto', flex: 1 }}>

      {/* Search */}
      {enterpriseMode && (
        <div style={{
          marginBottom: '12px',
          padding: '12px 14px',
          borderRadius: '12px',
          border: '1px solid #d8dcff',
          background: '#f6f8ff',
          fontSize: '12px',
          color: '#4f46e5',
          lineHeight: 1.7
        }}>
          当前为企业视图，正在查看「{enterpriseName}」的全部发货记录。企业成员的改动会在 30 秒内自动刷新到这里。
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          已发货 <strong>{shippingOrders.length}</strong> 单
        </span>
        <input
          className="form-input"
          style={{ flex: 1, maxWidth: '320px', height: '30px', fontSize: '12px' }}
          placeholder="🔍 搜索姓名 / 手机号 / 客服 / 序列号 / 快递单号"
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setPage(1) }}
        />
      </div>

      {/* Order list */}
      <div className="order-list">
        {pagedOrders.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)', fontSize: '13px' }}>
            {searchQuery ? '没有匹配的发货订单' : '暂无发货订单'}
          </div>
        )}

        {pagedOrders.map(order => {
          const fwdInfo = getForwardInfo(order)
          return (
            <div key={order.id} className="order-card" style={{ background: isOverdue(order) ? '#fff5f5' : undefined, borderLeft: isOverdue(order) ? '3px solid #e53935' : undefined }}>
              <div className="order-card__info">
                {/* Customer info */}
                <div className="order-card__name">
                  {order.customerName}
                  {order.platform && <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginLeft: '6px', fontWeight: 400 }}>{order.platform}</span>}
                  <span className={`order-card__status ${order.status === 'returned' ? 'order-card__status--returned' : isOverdue(order) ? 'order-card__status--returned' : 'order-card__status--dispatched'}`}>
                    {order.status === 'returned' ? '已归还' : isOverdue(order) ? '⚠️ 已逾期' : '已发货'}
                  </span>
                </div>
                <div className="order-card__address">{order.customerAddress}</div>
                {order.remarks && (
                  <div style={{ fontSize: '11px', color: '#e67e22', marginTop: '2px' }}>📝 {order.remarks}</div>
                )}
                <div className="order-card__meta">
                  {order.platform && <span>{order.platform}</span>}
                  {order.csRep && <span> · 客服 {order.csRep}</span>}
                  <span> · {order.customerPhone}</span>
                  <span> · {order.deviceId}</span>
                  {enterpriseMode && order.ownerEmail ? <span> · 所属 {order.ownerEmail}</span> : null}
                </div>

                {/* Tracking + Serial */}
                <div className="order-card__detail" style={{ marginTop: '6px' }}>
                  📦 快递单号: <strong>{order.trackingNumber || '-'}</strong>
                  <span style={{ marginLeft: '16px' }}>🔢 序列号: <strong>{order.serialNumber || '-'}</strong></span>
                </div>

                {/* Rental period */}
                {(order.rentalStart || order.rentalEnd) && (
                  <div className="order-card__dates" style={{ marginTop: '4px' }}>
                    租期: {order.rentalStart || '?'} ~ {order.rentalEnd || '?'}
                    <span style={{ marginLeft: '12px', color: 'var(--text-tertiary)', fontSize: '11px' }}>
                      实际发货: {order.dispatchDate}
                    </span>
                  </div>
                )}

                {/* Forwarding info */}
                {fwdInfo && (
                  <div style={{ marginTop: '6px', fontSize: '12px', color: '#e67e22', fontWeight: 500 }}>
                    🔄 {fwdInfo}
                    {order.forwardTracking && <span style={{ marginLeft: '8px', fontWeight: 400 }}>单号: {order.forwardTracking}</span>}
                  </div>
                )}
              </div>

              {/* Actions — only for dispatched orders */}
              {order.status === 'dispatched' && (
                <div className="order-card__actions" style={{ flexDirection: 'column', gap: '6px' }}>
                  <button className="settings-panel__btn settings-panel__btn--secondary"
                    style={{ fontSize: '11px', height: '28px', width: '56px' }}
                    onClick={() => handleReturn(order.id)}>
                    归还
                  </button>
                  {!order.forwardedToOrderId && (
                    <button className="settings-panel__btn settings-panel__btn--primary"
                      style={{ fontSize: '11px', height: '28px', width: '56px' }}
                      onClick={() => { setForwardSource(order); setSelectedTargetId(null); setForwardTracking(''); setTargetSearch('') }}>
                      转寄
                    </button>
                  )}
                </div>
              )}
              {order.status === 'returned' && (
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'right', minWidth: '60px' }}>
                  {order.returnDate && <span>归还日 {order.returnDate}</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '16px 0' }}>
          <button className="settings-panel__btn settings-panel__btn--secondary" style={{ fontSize: '12px', height: '28px', padding: '0 12px' }} onClick={() => setPage(1)} disabled={safePage === 1}>« 首页</button>
          <button className="settings-panel__btn settings-panel__btn--secondary" style={{ fontSize: '12px', height: '28px', padding: '0 12px' }} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1}>‹ 上一页</button>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>第 {safePage} / {totalPages} 页（共 {shippingOrders.length} 单）</span>
          <button className="settings-panel__btn settings-panel__btn--secondary" style={{ fontSize: '12px', height: '28px', padding: '0 12px' }} onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>下一页 ›</button>
          <button className="settings-panel__btn settings-panel__btn--secondary" style={{ fontSize: '12px', height: '28px', padding: '0 12px' }} onClick={() => setPage(totalPages)} disabled={safePage === totalPages}>末页 »</button>
        </div>
      )}

      {/* Forward modal */}
      {forwardSource && (
        <div className="dispatch-overlay" onClick={() => setForwardSource(null)}>
          <div className="dispatch-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="dispatch-dialog__title">转寄设备</div>

            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', background: 'var(--bg-tertiary)', padding: '8px 12px', borderRadius: '8px' }}>
              从 <strong>{forwardSource.customerName}</strong>（{forwardSource.customerPhone}）转出
              <br />设备: {forwardSource.serialNumber} · 型号: {forwardSource.deviceId}
            </div>

            {/* Target customer search */}
            <div className="form-group">
              <label className="form-label">选择转寄目标客户（同型号）</label>
              <input className="form-input" style={{ width: '100%' }} placeholder="搜索客户姓名或手机号" value={targetSearch} onChange={e => setTargetSearch(e.target.value)} autoFocus />
            </div>

            <div className="device-suggestions" style={{ maxHeight: '180px', overflowY: 'auto' }}>
              {forwardTargets.map(t => (
                <div key={t.id}
                  className={`device-suggestion ${selectedTargetId === t.id ? 'device-suggestion--selected' : ''}`}
                  onClick={() => setSelectedTargetId(t.id)}
                >
                  <span className="device-suggestion__serial">{t.customerName}</span>
                  <span className="device-suggestion__meta">
                    {t.customerPhone} · {t.deviceId} · 发货日 {t.shipmentDate || '-'} · 到期 {t.rentalEnd || '-'}
                    {enterpriseMode && t.ownerEmail ? ` · 所属 ${t.ownerEmail}` : ''}
                  </span>
                </div>
              ))}
              {forwardTargets.length === 0 && (
                <div className="device-suggestions__empty">没有同型号的待处理客户</div>
              )}
            </div>

            {/* Tracking number */}
            <div className="form-group">
              <label className="form-label">转寄快递单号</label>
              <input className="form-input" style={{ width: '100%' }} placeholder="输入转寄的快递单号" value={forwardTracking} onChange={e => setForwardTracking(e.target.value)} />
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button className="settings-panel__btn settings-panel__btn--secondary" onClick={() => setForwardSource(null)}>取消</button>
              <button className="settings-panel__btn settings-panel__btn--primary" onClick={handleForward} disabled={forwarding || !selectedTargetId || !forwardTracking.trim()}>
                {forwarding ? '转寄中...' : '确认转寄'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
