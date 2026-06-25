import { useEffect, useMemo, useState } from 'react'
import type { DailyStats, InventoryStats, Order } from '../types/customer'
import { syncOrdersAfterMutation } from '../services/order-change-sync'

type RentingOrder = Order & { deviceSerial?: string }

function normalizeDate(value?: string): Date | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  date.setHours(0, 0, 0, 0)
  return date
}

function getOverdueDays(order: RentingOrder): number {
  if (order.status === 'returned') return 0
  const end = normalizeDate(order.rentalEnd)
  if (!end) return 0

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.floor((today.getTime() - end.getTime()) / 86400000)
}

function isOverdue(order: RentingOrder): boolean {
  return getOverdueDays(order) > 2
}

function buildOverdueOrders(orders: RentingOrder[]): RentingOrder[] {
  return orders
    .filter(order => isOverdue(order))
    .sort((left, right) => getOverdueDays(right) - getOverdueDays(left))
}

function formatShipDate(order: RentingOrder): string {
  return order.dispatchDate || order.shipmentDate || '-'
}

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
  const [selectedShippingOrder, setSelectedShippingOrder] = useState<RentingOrder | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  function loadData() {
    window.electronAPI.getDailyStats().then(setStats)
    window.electronAPI.getInventoryStats().then(setInv)
    refreshRentingOverview().catch(() => {})
  }

  async function refreshRentingOverview(): Promise<{ orders: RentingOrder[]; overdue: RentingOrder[] }> {
    const orders = await window.electronAPI.getRentingOrders()
    const overdue = buildOverdueOrders(orders)
    setRentingOrders(orders)
    setOverdueOrders(overdue)
    setOverdueCount(overdue.length)
    setSelectedShippingOrder(current => {
      if (!current) return null
      return orders.find(order => order.id === current.id) || null
    })
    return { orders, overdue }
  }

  async function handleShowRenting() {
    setShowRenting(true)
    setLoadingRenting(true)
    try {
      await refreshRentingOverview()
    } finally {
      setLoadingRenting(false)
    }
  }

  async function handleShowOverdue() {
    setShowOverdue(true)
    setLoadingRenting(true)
    try {
      await refreshRentingOverview()
    } finally {
      setLoadingRenting(false)
    }
  }

  async function handleReturn(orderId: string) {
    await window.electronAPI.returnOrder(orderId)
    await syncOrdersAfterMutation()
    window.electronAPI.getDailyStats().then(setStats)
    window.electronAPI.getInventoryStats().then(setInv)
    await refreshRentingOverview()
  }

  const filteredRenting = useMemo(() => {
    if (!rentingSearch.trim()) return rentingOrders

    const query = rentingSearch.trim().toLowerCase()
    return rentingOrders.filter(order =>
      order.customerName.toLowerCase().includes(query) ||
      order.customerPhone.includes(query) ||
      order.deviceId.toLowerCase().includes(query) ||
      (order.deviceSerial || order.serialNumber || '').toLowerCase().includes(query)
    )
  }, [rentingOrders, rentingSearch])

  const overduePreview = overdueOrders.slice(0, 3)

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
          onClick={() => { handleShowRenting().catch(() => {}) }}
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
        <div
          className="stat-card stat-card--clickable"
          onClick={() => { handleShowOverdue().catch(() => {}) }}
          title="点击查看逾期订单"
        >
          <div className="stat-card__value" style={{ color: overdueCount > 0 ? '#e53935' : '#666' }}>{overdueCount}</div>
          <div className="stat-card__label">⚠️ 已逾期 ▸</div>
        </div>
      </div>

      <div style={{
        background: 'var(--bg-secondary)',
        borderRadius: '12px',
        padding: '18px',
        border: '1px solid var(--border)',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 600 }}>逾期提醒</div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
              超过到期日 2 天仍未归还的设备会显示在这里，点进去可以直接看发货信息。
            </div>
          </div>
          <button
            className="settings-panel__btn settings-panel__btn--secondary"
            onClick={() => { handleShowOverdue().catch(() => {}) }}
            style={{ fontSize: '12px', height: '30px', whiteSpace: 'nowrap' }}
          >
            查看全部
          </button>
        </div>

        {overduePreview.length === 0 ? (
          <div style={{
            padding: '18px',
            borderRadius: '10px',
            background: 'var(--bg-primary)',
            color: 'var(--text-tertiary)',
            fontSize: '12px',
            textAlign: 'center'
          }}>
            当前没有逾期设备
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {overduePreview.map(order => (
              <div
                key={order.id}
                style={{
                  background: '#fff5f5',
                  border: '1px solid #ffcdd2',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '16px',
                  cursor: 'pointer'
                }}
                onClick={() => setSelectedShippingOrder(order)}
              >
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {order.deviceId} · {order.deviceSerial || order.serialNumber || '未绑定序列号'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {order.customerName} · {order.customerPhone}
                  </div>
                  <div style={{ fontSize: '12px', color: '#e53935', marginTop: '6px', fontWeight: 600 }}>
                    到期日 {order.rentalEnd || '-'} · 已逾期 {getOverdueDays(order)} 天
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                    快递 {order.trackingNumber || '-'} · 发货日 {formatShipDate(order)}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', flexShrink: 0 }}>
                  <button
                    className="settings-panel__btn settings-panel__btn--secondary"
                    style={{ fontSize: '12px', height: '28px' }}
                    onClick={event => {
                      event.stopPropagation()
                      setSelectedShippingOrder(order)
                    }}
                  >
                    发货信息
                  </button>
                  <button
                    className="settings-panel__btn settings-panel__btn--secondary"
                    style={{ fontSize: '12px', height: '28px' }}
                    onClick={event => {
                      event.stopPropagation()
                      handleReturn(order.id).catch(() => {})
                    }}
                  >
                    归还
                  </button>
                </div>
              </div>
            ))}

            {overdueOrders.length > overduePreview.length && (
              <button
                className="settings-panel__btn settings-panel__btn--secondary"
                style={{ fontSize: '12px', height: '30px', justifySelf: 'flex-start' }}
                onClick={() => { handleShowOverdue().catch(() => {}) }}
              >
                还有 {overdueOrders.length - overduePreview.length} 条逾期记录，点击查看全部
              </button>
            )}
          </div>
        )}
      </div>

      {showOverdue && (
        <div className="dispatch-overlay" onClick={() => setShowOverdue(false)}>
          <div className="dispatch-dialog" onClick={event => event.stopPropagation()} style={{ width: '560px', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
            <div className="dispatch-dialog__title" style={{ color: '#e53935' }}>⚠️ 已逾期订单 ({overdueOrders.length})</div>
            <div style={{ overflowY: 'auto', flex: 1, maxHeight: '50vh' }}>
              {loadingRenting ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)' }}>加载中...</div>
              ) : overdueOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)' }}>暂无逾期订单 🎉</div>
              ) : (
                overdueOrders.map(order => (
                  <div key={order.id} className="order-card" style={{ margin: '0 0 8px 0', background: '#fff5f5', borderLeft: '3px solid #e53935' }}>
                    <div className="order-card__info">
                      <div className="order-card__name" style={{ fontSize: '14px' }}>
                        {order.customerName}
                        <span className="order-card__status order-card__status--returned">⚠️ 已逾期</span>
                      </div>
                      <div className="order-card__meta">
                        {order.customerPhone} · {order.deviceId} · {order.deviceSerial || order.serialNumber || '未绑定序列号'}
                      </div>
                      <div className="order-card__detail">
                        快递: {order.trackingNumber || '-'} · 发货日: {formatShipDate(order)}
                      </div>
                      <div className="order-card__detail" style={{ color: '#e53935', fontWeight: 500 }}>
                        到期日: {order.rentalEnd || '-'} · 已逾期 {getOverdueDays(order)} 天
                      </div>
                    </div>
                    <div className="order-card__actions" style={{ gap: '6px' }}>
                      <button
                        className="settings-panel__btn settings-panel__btn--secondary"
                        onClick={() => setSelectedShippingOrder(order)}
                      >
                        发货信息
                      </button>
                      <button
                        className="settings-panel__btn settings-panel__btn--secondary"
                        onClick={() => { handleReturn(order.id).catch(() => {}) }}
                      >
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

      {showRenting && (
        <div className="dispatch-overlay" onClick={() => setShowRenting(false)}>
          <div className="dispatch-dialog" onClick={event => event.stopPropagation()} style={{ width: '560px', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
            <div className="dispatch-dialog__title">租用中的订单 ({inv.renting})</div>
            <div style={{ marginBottom: '12px' }}>
              <input
                className="form-input"
                style={{ width: '100%', height: '30px', fontSize: '12px' }}
                placeholder="🔍 搜索客户姓名 / 手机号 / 设备型号 / 序列号"
                value={rentingSearch}
                onChange={event => setRentingSearch(event.target.value)}
              />
            </div>
            <div style={{ overflowY: 'auto', flex: 1, maxHeight: '50vh' }}>
              {loadingRenting ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)' }}>加载中...</div>
              ) : filteredRenting.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)' }}>暂无租用中的订单</div>
              ) : (
                filteredRenting.map(order => (
                  <div
                    key={order.id}
                    className="order-card"
                    style={{ margin: '0 0 8px 0', background: isOverdue(order) ? '#fff5f5' : undefined, borderLeft: isOverdue(order) ? '3px solid #e53935' : undefined }}
                  >
                    <div className="order-card__info">
                      <div className="order-card__name" style={{ fontSize: '14px' }}>
                        {order.customerName}
                        <span className="order-card__status order-card__status--dispatched">{isOverdue(order) ? '⚠️ 已逾期' : '已发货'}</span>
                      </div>
                      <div className="order-card__meta">
                        {order.customerPhone} · {order.deviceId} · {order.deviceSerial || order.serialNumber || '未绑定序列号'}
                      </div>
                      <div className="order-card__detail">
                        快递: {order.trackingNumber || '-'} · 发货日: {formatShipDate(order)}
                      </div>
                      {(order.rentalStart || order.rentalEnd) && (
                        <div className="order-card__detail">
                          {order.rentalStart && <>起租日 {order.rentalStart}</>}
                          {order.rentalStart && order.rentalEnd && <> · </>}
                          {order.rentalEnd && <>到期日 {order.rentalEnd}</>}
                          {isOverdue(order) && <span style={{ color: '#e53935', fontWeight: 600 }}> · 已逾期 {getOverdueDays(order)} 天</span>}
                        </div>
                      )}
                    </div>
                    <div className="order-card__actions" style={{ gap: '6px' }}>
                      <button
                        className="settings-panel__btn settings-panel__btn--secondary"
                        onClick={() => setSelectedShippingOrder(order)}
                      >
                        发货信息
                      </button>
                      <button
                        className="settings-panel__btn settings-panel__btn--secondary"
                        onClick={() => { handleReturn(order.id).catch(() => {}) }}
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

      {selectedShippingOrder && (
        <div className="dispatch-overlay" onClick={() => setSelectedShippingOrder(null)}>
          <div className="dispatch-dialog" onClick={event => event.stopPropagation()} style={{ width: '560px', maxHeight: '75vh', overflowY: 'auto' }}>
            <div className="dispatch-dialog__title" style={{ color: isOverdue(selectedShippingOrder) ? '#e53935' : 'var(--text-primary)' }}>
              {isOverdue(selectedShippingOrder) ? '逾期发货信息' : '发货信息详情'}
            </div>

            <div style={{ display: 'grid', gap: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '8px', fontSize: '13px' }}>
                <strong>客户姓名</strong>
                <span>{selectedShippingOrder.customerName}</span>
                <strong>联系电话</strong>
                <span>{selectedShippingOrder.customerPhone}</span>
                <strong>设备型号</strong>
                <span>{selectedShippingOrder.deviceId}</span>
                <strong>设备序列号</strong>
                <span>{selectedShippingOrder.deviceSerial || selectedShippingOrder.serialNumber || '未绑定'}</span>
                <strong>快递单号</strong>
                <span>{selectedShippingOrder.trackingNumber || '未填写'}</span>
                <strong>发货日期</strong>
                <span>{selectedShippingOrder.shipmentDate || '未填写'}</span>
                <strong>实际发货</strong>
                <span>{selectedShippingOrder.dispatchDate || '未填写'}</span>
                <strong>起租日</strong>
                <span>{selectedShippingOrder.rentalStart || '未填写'}</span>
                <strong>到期日</strong>
                <span>
                  {selectedShippingOrder.rentalEnd || '未填写'}
                  {isOverdue(selectedShippingOrder) && (
                    <strong style={{ color: '#e53935' }}> · 已逾期 {getOverdueDays(selectedShippingOrder)} 天</strong>
                  )}
                </span>
                <strong>平台 / 客服</strong>
                <span>{selectedShippingOrder.platform || '-'} / {selectedShippingOrder.csRep || '-'}</span>
              </div>

              <div style={{ background: 'var(--bg-tertiary)', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>收货地址</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  {selectedShippingOrder.customerAddress || '未填写'}
                </div>
              </div>

              {selectedShippingOrder.remarks && (
                <div style={{ background: '#fff8e1', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>订单备注</div>
                  <div style={{ fontSize: '13px', color: '#8a5b00', lineHeight: 1.7 }}>
                    {selectedShippingOrder.remarks}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '16px' }}>
              <button
                className="settings-panel__btn settings-panel__btn--secondary"
                onClick={() => {
                  handleReturn(selectedShippingOrder.id).catch(() => {})
                }}
                disabled={selectedShippingOrder.status === 'returned'}
              >
                {selectedShippingOrder.status === 'returned' ? '已归还' : '标记归还'}
              </button>
              <button className="settings-panel__btn settings-panel__btn--secondary" onClick={() => setSelectedShippingOrder(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
