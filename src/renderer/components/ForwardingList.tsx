import { useState, useEffect, useMemo } from 'react'
import type { ForwardingOption, MatchLevel, Order } from '../types/customer'
import { syncOrdersAfterMutation } from '../services/order-change-sync'

interface ForwardingListProps {
  options: ForwardingOption[]
  sourceName?: string
  sourcePhone?: string
  onForwarded?: () => void
}

const levelLabel: Record<MatchLevel, string> = {
  same_city: '同市',
  same_province: '同省',
  adjacent_province: '邻省'
}

const rankEmoji: Record<MatchLevel, string> = {
  same_city: '★',
  same_province: '●',
  adjacent_province: '○'
}

export function ForwardingList({ options, sourceName, sourcePhone, onForwarded }: ForwardingListProps): JSX.Element {
  const [forwardTarget, setForwardTarget] = useState<ForwardingOption | null>(null)
  const [tracking, setTracking] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [forwarding, setForwarding] = useState(false)
  const [sourceOrder, setSourceOrder] = useState<Order | null>(null)
  const [autoSerial, setAutoSerial] = useState('')  // serial from source's dispatched order
  const [searchQuery, setSearchQuery] = useState('')
  const [forwardedNames, setForwardedNames] = useState<Set<string>>(new Set())

  // Find source customer's order + track forwarded customers
  useEffect(() => {
    if (!sourceName || !sourcePhone) return
    window.electronAPI.getAllOrders().then((orders: Order[]) => {
      const src = orders.find(
        o => o.customerName === sourceName && o.customerPhone === sourcePhone && o.status !== 'returned'
      )
      setSourceOrder(src || null)
      // Auto-find serial number from source's dispatched order
      if (src?.status === 'pending') {
        const dispatched = orders.find(
          o => o.customerName === sourceName && o.customerPhone === sourcePhone && o.status === 'dispatched'
        )
        setAutoSerial(dispatched?.serialNumber || '')
      } else if (src?.status === 'dispatched') {
        setAutoSerial(src.serialNumber || '')
      }
      // Track which customers have already been forwarded to (from this source)
      const fwd = new Set<string>()
      orders.forEach(o => {
        if (o.forwardedFromOrderId === src?.id) {
          fwd.add(`${o.customerName}|${o.customerPhone}`)
        }
      })
      setForwardedNames(fwd)
    })
  }, [sourceName, sourcePhone])

  // Filter options by search query
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options
    const q = searchQuery.trim().toLowerCase()
    return options.filter(o =>
      o.customer.name.toLowerCase().includes(q) ||
      o.customer.phone.includes(q)
    )
  }, [options, searchQuery])

  if (options.length === 0) {
    return (
      <div className="main-content__empty">
        <div className="main-content__empty-icon">🔍</div>
        <div className="main-content__empty-title">无匹配的转寄客户</div>
        <div className="main-content__empty-text">
          未找到与当前客户地址相近且使用相同设备的客户。
        </div>
      </div>
    )
  }

  async function handleConfirmForward() {
    if (!forwardTarget || !tracking.trim()) return

    // Find target order by name + phone
    const allOrders = await window.electronAPI.getAllOrders()
    const targetOrder = allOrders.find(
      o => o.customerName === forwardTarget.customer.name &&
        o.customerPhone === forwardTarget.customer.phone &&
        o.status === 'pending'
    )
    if (!targetOrder) {
      alert('未找到目标客户的待发货订单，请先在订单管理中确认该客户已导入')
      return
    }

    setForwarding(true)
    try {
      if (sourceOrder && sourceOrder.status === 'dispatched') {
        // Source already dispatched: just forward
        await window.electronAPI.forwardOrder(sourceOrder.id, targetOrder.id, tracking.trim())
      } else if (sourceOrder && sourceOrder.status === 'pending') {
        // Source is pending: dispatch first, then forward
        if (!serialNumber.trim()) {
          alert('请选择设备序列号')
          setForwarding(false)
          return
        }
        await window.electronAPI.dispatchAndForward(sourceOrder.id, targetOrder.id, serialNumber.trim(), tracking.trim())
      } else {
        alert('未找到来源客户的订单，请先在订单管理中确认该客户已导入')
        setForwarding(false)
        return
      }
      await syncOrdersAfterMutation()
      setForwardTarget(null)
      setTracking('')
      setSerialNumber('')
      onForwarded?.()
    } catch (err: any) {
      alert(err.message || '转寄失败')
    } finally {
      setForwarding(false)
    }
  }

  return (
    <div className="forwarding-list">
      {/* Search bar */}
      {options.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <input
            className="form-input"
            style={{ width: '100%', height: '30px', fontSize: '12px' }}
            placeholder="🔍 搜索推荐客户姓名或手机号"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      )}
      {filteredOptions.length === 0 && searchQuery.trim() && (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)', fontSize: '13px' }}>
          没有匹配的转寄客户
        </div>
      )}
      {filteredOptions.map((option, index) => {
        const key = `${option.customer.name}|${option.customer.phone}`
        const alreadyForwarded = forwardedNames.has(key)
        return (
        <div key={`${option.customer.name}-${option.customer.phone}`} className="forwarding-card">
          <div className={`forwarding-card__rank forwarding-card__rank--${option.matchLevel}`}>
            {rankEmoji[option.matchLevel]}
          </div>
          <div className="forwarding-card__info">
            <div className="forwarding-card__name">
              {option.customer.name}
            </div>
            <div className="forwarding-card__address">
              {option.customer.address}
            </div>
            <div className="forwarding-card__phone">
              {option.customer.phone} · {option.customer.deviceId}
            </div>
            <div className="forwarding-card__dates">
              <span className="forwarding-card__date-item">发货日 {option.customer.shipmentDate || '-'}</span>
              <span className="forwarding-card__date-item">起租日 {option.customer.rentalStart || '-'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}>
            <span className={`forwarding-card__tag forwarding-card__tag--${option.matchLevel}`}>
              {levelLabel[option.matchLevel]}
            </span>
            {alreadyForwarded ? (
              <span style={{ fontSize: '11px', color: '#2e7d32', fontWeight: 500, padding: '4px 8px', background: '#e8f5e9', borderRadius: '12px' }}>
                已转寄
              </span>
            ) : (
              <button
                className="settings-panel__btn settings-panel__btn--primary"
                style={{ fontSize: '11px', height: '26px', padding: '0 10px' }}
                onClick={() => {
                  setForwardTarget(option)
                  setTracking('')
                  setSerialNumber(autoSerial)
                }}
              >
                确认转寄
              </button>
            )}
          </div>
        </div>
        )
      })}

      {/* Forward confirm modal */}
      {forwardTarget && (
        <div className="dispatch-overlay" onClick={() => setForwardTarget(null)}>
          <div className="dispatch-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="dispatch-dialog__title">确认转寄</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', background: 'var(--bg-tertiary)', padding: '8px 12px', borderRadius: '8px' }}>
              从 <strong>{sourceName}</strong> 转寄给 <strong>{forwardTarget.customer.name}</strong>
              {sourceOrder && (
                <span style={{ marginLeft: '8px', color: sourceOrder.status === 'dispatched' ? '#2e7d32' : '#e67e22' }}>
                  ({sourceOrder.status === 'dispatched' ? '已发货' : '待发货'})
                </span>
              )}
            </div>

            {/* Serial number (only if source is pending, auto-filled from dispatched order) */}
            {sourceOrder && sourceOrder.status === 'pending' && (
              <div className="form-group">
                <label className="form-label">设备序列号（首次发货）</label>
                {autoSerial ? (
                  <div style={{ fontSize: '12px', color: '#2e7d32', marginBottom: '4px' }}>
                    ✅ 已从发货记录中找到序列号
                  </div>
                ) : (
                  <div style={{ fontSize: '12px', color: '#e67e22', marginBottom: '4px' }}>
                    ⚠ 未在发货信息中找到该客户的序列号，请手动输入
                  </div>
                )}
                <input
                  className="form-input"
                  style={{ width: '100%' }}
                  placeholder="输入或选择序列号"
                  value={serialNumber}
                  onChange={e => setSerialNumber(e.target.value)}
                  autoFocus={!autoSerial}
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">转寄快递单号</label>
              <input className="form-input" style={{ width: '100%' }} placeholder="输入转寄快递单号" value={tracking} onChange={e => setTracking(e.target.value)} autoFocus={sourceOrder?.status === 'dispatched'} />
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button className="settings-panel__btn settings-panel__btn--secondary" onClick={() => setForwardTarget(null)}>取消</button>
              <button className="settings-panel__btn settings-panel__btn--primary" onClick={handleConfirmForward} disabled={forwarding || !tracking.trim() || (sourceOrder?.status === 'pending' && !serialNumber.trim())}>
                {forwarding ? '转寄中...' : '确认转寄'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
