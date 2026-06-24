import { useEffect, useState } from 'react'
import type { DailyStats, InventoryStats, Order } from '../types/customer'
import { syncOrdersAfterMutation } from '../services/order-change-sync'

type RentingOrder = Order & { deviceSerial?: string }

export function Dashboard(): JSX.Element {
  const [stats, setStats] = useState<DailyStats>({ dispatchCount: 0, returnCount: 0, idleStock: 0 })
  const [inv, setInv] = useState<InventoryStats>({ total: 0, idle: 0, renting: 0, returnedToday: 0 })
  const [showRenting, setShowRenting] = useState(false)
  const [rentingOrders, setRentingOrders] = useState<RentingOrder[]>([])
  const [loadingRenting, setLoadingRenting] = useState(false)
  const [rentingSearch, setRentingSearch] = useState('')
  const [showOverdue, setShowOverdue] = useState(false)
  const [overdueOrders, setOverdueOrders] = useState<RentingOrder[]>([])
  const [overdueCount, setOverdueCount] = useState(0)

  useEffect(() => {
    loadData()
  }, [])

  function loadData() {
    window.electronAPI.getDailyStats().then(setStats)
    window.electronAPI.getInventoryStats().then(setInv)
  }

    function calcOverdue(orders: RentingOrder[]): number {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return orders.filter(o => {
      if (o.status === 'returned') return false
      if (!o.rentalEnd) return false
      const end = new Date(o.rentalEnd)
      end.setHours(0, 0, 0, 0)
      const diff = Math.floor((today.getTime() - end.getTime()) / 86400000)
      return diff > 2
    }).length
  }

  async function handleShowRenting() {
    setShowRenting(true)
    setLoadingRenting(true)
    try {
      const orders = await window.electronAPI.getRentingOrders()
      setRentingOrders(orders)
      setOverdueCount(calcOverdue(orders))
      setOverdueOrders(orders.filter(o => { if (o.status === 'returned' || !o.rentalEnd) return false; const today = new Date(); today.setHours(0,0,0,0); const end = new Date(o.rentalEnd); end.setHours(0,0,0,0); return Math.floor((today.getTime() - end.getTime()) / 86400000) > 2 }))
    } finally {
      setLoadingRenting(false)
    }
  }

  async function handleShowOverdue() {
    setShowOverdue(true)
    setLoadingRenting(true)
    try {
      const orders = await window.electronAPI.getRentingOrders()
      const overdue = orders.filter(order => isOverdue(order))
      setRentingOrders(orders)
      setOverdueCount(calcOverdue(orders))
      setOverdueOrders(overdue)
    } finally {
      setLoadingRenting(false)
    }
  }

  async function handleReturn(orderId: string) {
    await window.electronAPI.returnOrder(orderId)
    await syncOrdersAfterMutation()
    loadData()
    // Refresh the list
    const orders = await window.electronAPI.getRentingOrders()
    setRentingOrders(orders)
  }

    function isOverdue(order: RentingOrder): boolean {
    if (order.status === 'returned') return false
    if (!order.rentalEnd) return false
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const end = new Date(order.rentalEnd); end.setHours(0, 0, 0, 0)
    return Math.floor((today.getTime() - end.getTime()) / 86400000) > 2
  }

  const filteredRenting = rentingSearch.trim()
    ? rentingOrders.filter(o =>
        o.customerName.toLowerCase().includes(rentingSearch.trim().toLowerCase()) ||
        o.customerPhone.includes(rentingSearch.trim())
      )
    : rentingOrders

  return (
    <div className="dashboard" style={{ padding: '0 28px 20px', overflowY: 'auto', flex: 1 }}>
      <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '16px', marginTop: '4px' }}>库存概览</h3>
      <div className="stats-row" style={{ padding: '0 0 16px 0' }}>
        <div className="stat-card">
          <div className="stat-card__value">{inv.total}</div>
          <div className="stat-card__label">设备总数</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value" style={{ color: '#2e7d32' }}>{inv.idle}</div>
          <div className="stat-card__label">空闲中</div>
        </div>
        <div
          className="stat-card stat-card--clickable"
          onClick={handleShowRenting}
          title="点击查看租用中的订单"
        >
          <div className="stat-card__value" style={{ color: '#1565c0' }}>{inv.renting}</div>
          <div className="stat-card__label">租用中 ▸</div>
        </div>
      </div>

      <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '16px' }}>今日动态</h3>
      <div className="stats-row" style={{ padding: '0 0 16px 0' }}>
        <div className="stat-card">
          <div className="stat-card__value" style={{ color: '#1565c0' }}>{stats.dispatchCount}</div>
          <div className="stat-card__label">今日发货</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value" style={{ color: '#2e7d32' }}>{stats.returnCount}</div>
          <div className="stat-card__label">今日归还</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value">{stats.idleStock}</div>
          <div className="stat-card__label">库存剩余</div>
        </div>
        <div className="stat-card stat-card--clickable" onClick={handleShowOverdue} title="点击查看逾期订单">
          <div className="stat-card__value" style={{ color: overdueCount > 0 ? '#e53935' : '#666' }}>{overdueCount}</div>
          <div className="stat-card__label">⚠️ 已逾期 ▸</div>
        </div>
      </div>

      {/* Overdue Orders Modal */}
      {showOverdue && (
        <div className="dispatch-overlay" onClick={() => setShowOverdue(false)}>
          <div className="dispatch-dialog" onClick={e => e.stopPropagation()} style={{ width: '520px', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
            <div className="dispatch-dialog__title" style={{ color: '#e53935' }}>⚠️ 已逾期订单 ({overdueOrders.length})</div>
            <div style={{ overflowY: 'auto', flex: 1, maxHeight: '50vh' }}>
              {overdueOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)' }}>暂无逾期订单 🎉</div>
              ) : (
                overdueOrders.map(order => (
                  <div key={order.id} className="order-card" style={{ margin: '0 0 8px 0', background: '#fff5f5', borderLeft: '3px solid #e53935' }}>
                    <div className="order-card__info">
                      <div className="order-card__name" style={{ fontSize: '14px' }}>
                        {order.customerName}
                        <span className="order-card__status order-card__status--returned">⚠️ 已逾期</span>
                      </div>
                      <div className="order-card__meta">{order.customerPhone} · {order.deviceId}</div>
                      <div className="order-card__detail">
                        序列号: {order.deviceSerial || order.serialNumber} · 快递: {order.trackingNumber}
                      </div>
                      <div className="order-card__detail" style={{ color: '#e53935', fontWeight: 500 }}>
                        到期日: {order.rentalEnd}
                        {order.rentalEnd && (() => { const today = new Date(); today.setHours(0,0,0,0); const end = new Date(order.rentalEnd); end.setHours(0,0,0,0); const diff = Math.floor((today.getTime() - end.getTime()) / 86400000); return <span> · 已逾期 {diff} 天</span> })()}
                      </div>
                    </div>
                    <div className="order-card__actions">
                      <button className="settings-panel__btn settings-panel__btn--secondary" onClick={() => handleReturn(order.id)}>
                        归还
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button className="settings-panel__btn settings-panel__btn--secondary" onClick={() => setShowOverdue(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* Renting Orders Modal */}
      {showRenting && (
        <div className="dispatch-overlay" onClick={() => setShowRenting(false)}>
          <div className="dispatch-dialog" onClick={e => e.stopPropagation()} style={{ width: '520px', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
            <div className="dispatch-dialog__title">租用中的订单 ({inv.renting})</div>
            <div style={{ marginBottom: '12px' }}>
              <input
                className="form-input"
                style={{ width: '100%', height: '30px', fontSize: '12px' }}
                placeholder="🔍 搜索客户姓名或手机号"
                value={rentingSearch}
                onChange={e => setRentingSearch(e.target.value)}
              />
            </div>
            <div style={{ overflowY: 'auto', flex: 1, maxHeight: '50vh' }}>
              {loadingRenting ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)' }}>加载中...</div>
              ) : filteredRenting.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)' }}>暂无租用中的订单</div>
              ) : (
                filteredRenting.map(order => (
                  <div key={order.id} className="order-card" style={{ margin: '0 0 8px 0', background: isOverdue(order) ? '#fff5f5' : undefined, borderLeft: isOverdue(order) ? '3px solid #e53935' : undefined }}>
                    <div className="order-card__info">
                      <div className="order-card__name" style={{ fontSize: '14px' }}>
                        {order.customerName}
                        <span className="order-card__status order-card__status--dispatched">{isOverdue(order) ? '⚠️ 已逾期' : '已发货'}</span>
                      </div>
                      <div className="order-card__meta">{order.customerPhone} · {order.deviceId}</div>
                      <div className="order-card__detail">
                        序列号: {order.deviceSerial || order.serialNumber} · 快递: {order.trackingNumber}
                      </div>
                      {(order.rentalStart || order.rentalEnd) && (
                        <div className="order-card__detail">
                          {order.rentalStart && <>起租日 {order.rentalStart}</>}
                          {order.rentalStart && order.rentalEnd && <> · </>}
                          {order.rentalEnd && <>到期日 {order.rentalEnd}</>}
                        </div>
                      )}
                    </div>
                    <div className="order-card__actions">
                      <button
                        className="settings-panel__btn settings-panel__btn--secondary"
                        onClick={() => handleReturn(order.id)}
                      >
                        归还
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button className="settings-panel__btn settings-panel__btn--secondary" onClick={() => setShowRenting(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
