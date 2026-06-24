import { useState, useEffect, useMemo } from 'react'
import type { ExpiringCustomer, Order } from '../types/customer'

interface SidebarProps {
  customers: ExpiringCustomer[]
  selected: ExpiringCustomer | null
  onSelect: (customer: ExpiringCustomer) => void
}

export function Sidebar({ customers, selected, onSelect }: SidebarProps): JSX.Element {
  const [searchQuery, setSearchQuery] = useState('')
  const [forwardedKeys, setForwardedKeys] = useState<Set<string>>(new Set())

  // Check which customers have already been forwarded
  useEffect(() => {
    window.electronAPI.getAllOrders().then((orders: Order[]) => {
      const fwd = new Set<string>()
      orders.forEach(o => {
        if (o.forwardedFromOrderId) {
          // Someone was forwarded TO this customer
          fwd.add(`${o.customerName}|${o.customerPhone}`)
        }
      })
      setForwardedKeys(fwd)
    })
  }, [customers])

  // Filter by search
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return customers
    const q = searchQuery.trim().toLowerCase()
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.address.toLowerCase().includes(q) ||
      c.deviceId.toLowerCase().includes(q)
    )
  }, [customers, searchQuery])

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <div className="sidebar__title">今日到期</div>
        <div className="sidebar__subtitle">
          {customers.length > 0
            ? `${customers.length} 个客户租赁到期`
            : '暂无到期客户'}
        </div>
      </div>

      {/* Search */}
      {customers.length > 0 && (
        <div style={{ padding: '0 12px 8px' }}>
          <input
            className="form-input"
            style={{ width: '100%', height: '28px', fontSize: '11px' }}
            placeholder="🔍 搜索姓名/电话/地址/型号"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      )}

      <div className="sidebar__list">
        {filtered.map((customer) => {
          const key = `${customer.name}|${customer.phone}`
          const isForwarded = forwardedKeys.has(key)
          return (
            <div
              key={key}
              className={`customer-card ${selected?.name === customer.name && selected?.phone === customer.phone ? 'customer-card--selected' : ''}`}
              onClick={() => onSelect(customer)}
            >
              <div className="customer-card__name">{customer.name}</div>
              <div className="customer-card__device">{customer.deviceId}</div>
              <div className="customer-card__info">
                <div>{customer.address}</div>
                <div>{customer.phone}</div>
                {customer.rentalStart && (
                  <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                    发货 {customer.shipmentDate || '-'} · 起租 {customer.rentalStart} · 到期 {customer.rentalEnd}
                  </div>
                )}
              </div>
              <span className={`customer-card__badge ${isForwarded ? 'customer-card__badge--forwarded' : ''}`}>
                {isForwarded ? '✓ 已转寄' : '● 今日到期'}
              </span>
            </div>
          )
        })}
        {filtered.length === 0 && searchQuery.trim() && (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>
            没有匹配的客户
          </div>
        )}
        {customers.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>
            点击「获取数据」加载客户信息
          </div>
        )}
      </div>
    </aside>
  )
}
