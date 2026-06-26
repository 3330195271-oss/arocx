import { useEffect, useState, useMemo } from 'react'
import type { Order } from '../types/customer'
import type { HomeOrderFilter } from '../types/home-navigation'
import { syncOrdersAfterMutation } from '../services/order-change-sync'
import {
  deleteEnterpriseOrder,
  dispatchEnterpriseOrder,
  dispatchEnterpriseOrderWithNewDevice,
  getFriendList,
  getUser,
  returnEnterpriseOrder,
  shareOrder
} from '../services/api-client'
import {
  getEnterpriseWorkspaceInfo,
  loadEnterpriseDevices,
  loadEnterpriseOrders,
  type WorkspaceDevice,
  type WorkspaceOrder
} from '../services/enterprise-workspace'
import { buildElectronSyncOptions, CLOUD_SYNC_INTERVAL_MINUTES, pullNow } from '../services/sync-service'

type DispatchTarget = { orderId: string; deviceId: string } | null
type OrderFilter = HomeOrderFilter

const filterOptions: { key: OrderFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待发货' },
  { key: 'expiring', label: '即将到期' },
  { key: 'dispatched', label: '已发订单' },
  { key: 'returned', label: '已归还' }
]

const PAGE_SIZE = 10

function getTodayStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getTomorrowStr(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

interface OrderPanelProps {
  initialFilter?: OrderFilter
  initialDate?: string
}

export function OrderPanel({ initialFilter = 'pending', initialDate = '' }: OrderPanelProps): JSX.Element {
  const [allOrders, setAllOrders] = useState<WorkspaceOrder[]>([])
  const [allDevices, setAllDevices] = useState<WorkspaceDevice[]>([])
  const [idleDevices, setIdleDevices] = useState<WorkspaceDevice[]>([])
  const [filter, setFilter] = useState<OrderFilter>(initialFilter)
  const [dispatchTarget, setDispatchTarget] = useState<DispatchTarget>(null)
  const [serialNumber, setSerialNumber] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [dispatching, setDispatching] = useState(false)
  const [shareTarget, setShareTarget] = useState<Order | null>(null)
  const [friends, setFriends] = useState<Array<{ id: number; email: string }>>([])
  const [loadingFriends, setLoadingFriends] = useState(false)
  const [sharingFriendId, setSharingFriendId] = useState<number | null>(null)
  const [shareMsg, setShareMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // New order form
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [newModel, setNewModel] = useState('')
  const [newShipmentDate, setNewShipmentDate] = useState('')
  const [newRentalStart, setNewRentalStart] = useState('')
  const [newRentalEnd, setNewRentalEnd] = useState('')
  const [creating, setCreating] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [dispatchDate, setDispatchDate] = useState<string>(initialDate)
  const [page, setPage] = useState(1)
  const [dispatchOk, setDispatchOk] = useState<{ orderId: string; name: string; serial: string; tracking: string; device: string } | null>(null)
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([])
  const [enterpriseMode, setEnterpriseMode] = useState(false)
  const [enterpriseName, setEnterpriseName] = useState('')

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      const workspace = await getEnterpriseWorkspaceInfo()
      if (cancelled) return
      setEnterpriseMode(workspace.enabled)
      setEnterpriseName(workspace.enterpriseName)
      await loadData(workspace.enabled)
    }

    bootstrap().catch(() => {})
    return () => { cancelled = true }
  }, [])

  async function loadData(useEnterpriseMode = enterpriseMode) {
    const [orders, devices] = useEnterpriseMode
      ? await Promise.all([loadEnterpriseOrders(), loadEnterpriseDevices()])
      : await Promise.all([window.electronAPI.getAllOrders(), window.electronAPI.getDevices()])

    const nextOrders = orders as WorkspaceOrder[]
    const nextAllDevices = devices as WorkspaceDevice[]
    const nextIdleDevices = nextAllDevices.filter(device => device.status === 'idle')

    setAllOrders(nextOrders)
    setAllDevices(nextAllDevices)
    setIdleDevices(nextIdleDevices)
    setSelectedOrderIds(prev => prev.filter(id => nextOrders.some(order => order.id === id)))
  }

  async function refreshAfterEnterpriseMutation() {
    try {
      await pullNow(buildElectronSyncOptions())
    } catch {
      // Enterprise list is server-driven; local pull failure should not block the refreshed view.
    }
    await loadData(true)
  }

  // Client-side filtering
  const filteredOrders = useMemo(() => {
    let list: WorkspaceOrder[]
    const today = getTodayStr()
    const tomorrow = getTomorrowStr()
    switch (filter) {
      case 'pending':
        list = allOrders.filter(o => o.status === 'pending')
        break
      case 'expiring':
        // All non-returned orders whose rentalEnd is tomorrow or today
        list = allOrders.filter(o =>
          o.status !== 'returned' &&
          (o.rentalEnd === today || o.rentalEnd === tomorrow)
        )
        break
      case 'dispatched':
        list = allOrders.filter(o => o.status === 'dispatched')
        break
      case 'returned':
        list = allOrders.filter(o => o.status === 'returned')
        break
      default:
        list = allOrders
    }
    // Filter by selected date (skip for expiring — it has its own date logic)
    // For pending orders, match shipmentDate (expected); for dispatched/returned, match dispatchDate (actual)
    if (dispatchDate && filter !== 'expiring') {
      list = list.filter(o => {
        if (o.status === 'pending') {
          return o.shipmentDate === dispatchDate
        }
        return o.dispatchDate === dispatchDate
      })
    }
    // Search by name, phone, or csRep
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(o =>
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.includes(q) ||
        o.csRep.toLowerCase().includes(q)
      )
    }
    return list
  }, [allOrders, filter, dispatchDate, searchQuery])

  // Pagination: always paginate, 10 per page
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)

  const orders = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return filteredOrders.slice(start, start + PAGE_SIZE)
  }, [filteredOrders, safePage])

  // Reset page when filters change
  function changeFilter(f: OrderFilter) {
    setFilter(f)
    setPage(1)
    setSelectedOrderIds([])
    if (f === 'expiring') {
      setDispatchDate('')  // clear date filter, expiring has its own date logic
    }
  }
  function changeDispatchDate(d: string) {
    setDispatchDate(d)
    setPage(1)
    setSelectedOrderIds([])
  }
  function changeSearch(q: string) {
    setSearchQuery(q)
    setPage(1)
    setSelectedOrderIds([])
  }
  function goToday() {
    setFilter('pending')
    setDispatchDate(getTodayStr())
    setPage(1)
    setSelectedOrderIds([])
  }

  function openDispatch(order: WorkspaceOrder) {
    setDispatchTarget({ orderId: order.id, deviceId: '' })
    setSerialNumber('')
    setTrackingNumber('')
  }

  async function openShareDialog(order: WorkspaceOrder) {
    const user = getUser()
    if (user?.tier === 'free') {
      alert('好友代发需要 Pro+ 及以上版本，请先升级')
      return
    }

    if (enterpriseMode && order.ownerEmail && order.ownerEmail !== user?.email) {
      alert('企业成员的共享订单目前不能直接用好友代发，请由订单所属账号发起分享')
      return
    }

    setShareTarget(order)
    setShareMsg(null)
    setLoadingFriends(true)
    try {
      const result = await getFriendList()
      setFriends(result.friends)
    } catch (err: any) {
      setShareMsg({ type: 'error', text: err.message || '加载好友列表失败' })
    } finally {
      setLoadingFriends(false)
    }
  }

  async function handleDispatch() {
    if (!dispatchTarget || !canDispatchExistingDevice || !resolvedDispatchSerialNumber || !trackingNumber.trim()) return
    setDispatching(true)
    try {
      const order = enterpriseMode
        ? (await dispatchEnterpriseOrder(dispatchTarget.orderId, resolvedDispatchSerialNumber, trackingNumber.trim())).order
        : await window.electronAPI.dispatchOrder(dispatchTarget.orderId, resolvedDispatchSerialNumber, trackingNumber.trim())

      if (enterpriseMode) {
        await refreshAfterEnterpriseMutation()
      } else {
        await syncOrdersAfterMutation()
      }
      setDispatchTarget(null)
      setDispatchOk({
        orderId: order.id,
        name: order.customerName,
        serial: resolvedDispatchSerialNumber,
        tracking: trackingNumber.trim(),
        device: order.deviceId
      })
      await loadData(enterpriseMode)
      setTimeout(() => setDispatchOk(null), 10000)
    } catch (err: any) {
      alert(err.message || '发货失败')
    } finally {
      setDispatching(false)
    }
  }

  async function handleAddAndDispatch() {
    if (!dispatchTarget || !canAddAndDispatch || !normalizedSerialNumber || !trackingNumber.trim()) return
    setDispatching(true)
    try {
      const order = enterpriseMode
        ? (await dispatchEnterpriseOrderWithNewDevice(dispatchTarget.orderId, normalizedSerialNumber, trackingNumber.trim())).order
        : await window.electronAPI.dispatchOrderWithNewDevice(dispatchTarget.orderId, normalizedSerialNumber, trackingNumber.trim())

      if (enterpriseMode) {
        await refreshAfterEnterpriseMutation()
      } else {
        await syncOrdersAfterMutation()
      }

      setDispatchTarget(null)
      setDispatchOk({
        orderId: order.id,
        name: order.customerName,
        serial: normalizedSerialNumber,
        tracking: trackingNumber.trim(),
        device: order.deviceId
      })
      await loadData(enterpriseMode)
      setTimeout(() => setDispatchOk(null), 10000)
    } catch (err: any) {
      alert(err.message || '入库并发货失败')
    } finally {
      setDispatching(false)
    }
  }

  async function handleReturn(orderId: string) {
    if (enterpriseMode) {
      await returnEnterpriseOrder(orderId)
      await refreshAfterEnterpriseMutation()
      return
    }

    await window.electronAPI.returnOrder(orderId)
    await syncOrdersAfterMutation()
    await loadData()
  }

  async function handleDelete(order: WorkspaceOrder) {
    if (!confirm(`确认删除订单「${order.customerName}」？删除后会同步到云端。`)) return
    try {
      if (enterpriseMode) {
        await deleteEnterpriseOrder(order.id)
        await refreshAfterEnterpriseMutation()
        return
      }

      await window.electronAPI.deleteOrder(order.id)
      await syncOrdersAfterMutation()
      await loadData()
    } catch (err: any) {
      alert(err.message || '删除订单失败')
    }
  }

  async function handleShareToFriend(friendId: number) {
    if (!shareTarget) return
    setSharingFriendId(friendId)
    setShareMsg(null)
    try {
      const result = await shareOrder(shareTarget.id, friendId)
      setShareMsg({ type: 'success', text: result.message })
      setTimeout(() => {
        setShareTarget(null)
        setShareMsg(null)
      }, 800)
    } catch (err: any) {
      setShareMsg({ type: 'error', text: err.message || '分享失败' })
    } finally {
      setSharingFriendId(null)
    }
  }

  async function handleCreateOrder() {
    if (!newName.trim() || !newPhone.trim() || !newAddress.trim() || !newModel.trim()) return
    setCreating(true)
    try {
      await window.electronAPI.createOrder(
        newName,
        newPhone,
        newAddress,
        newModel,
        newShipmentDate,
        newRentalStart,
        newRentalEnd
      )
      await syncOrdersAfterMutation()
      setNewName('')
      setNewPhone('')
      setNewAddress('')
      setNewModel('')
      setNewShipmentDate('')
      setNewRentalStart('')
      setNewRentalEnd('')
      setShowAddForm(false)
      await loadData(enterpriseMode)
    } finally {
      setCreating(false)
    }
  }

  // Show all idle devices, filter by typed serial number
  const availableDevices = useMemo(() => {
    if (!dispatchTarget) return []
    let list = idleDevices
    if (serialNumber.trim()) {
      const q = serialNumber.trim().toLowerCase()
      list = list.filter(d => d.serialNumber.toLowerCase().includes(q))
    }
    return list
  }, [dispatchTarget, idleDevices, serialNumber])

  const activeDispatchOrder = useMemo(() => (
    dispatchTarget ? allOrders.find(order => order.id === dispatchTarget.orderId) || null : null
  ), [allOrders, dispatchTarget])

  const normalizedSerialNumber = serialNumber.trim()

  const matchedDevice = useMemo(() => {
    if (!normalizedSerialNumber) return null
    const keyword = normalizedSerialNumber.toLowerCase()
    return allDevices.find(device => device.serialNumber.trim().toLowerCase() === keyword) || null
  }, [allDevices, normalizedSerialNumber])

  const resolvedDispatchSerialNumber = matchedDevice?.serialNumber || normalizedSerialNumber
  const canDispatchExistingDevice = !!matchedDevice && matchedDevice.status === 'idle' && !!trackingNumber.trim()
  const canAddAndDispatch = !!activeDispatchOrder && !!normalizedSerialNumber && !matchedDevice && !!trackingNumber.trim()
  const serialExistsButUnavailable = !!matchedDevice && matchedDevice.status !== 'idle'

  const pendingOrdersOnPage = useMemo(() => (
    orders.filter(order => order.status === 'pending')
  ), [orders])

  const selectedPendingOrders = useMemo(() => (
    allOrders.filter(order => selectedOrderIds.includes(order.id) && order.status === 'pending')
  ), [allOrders, selectedOrderIds])

  const allPendingOnPageSelected = pendingOrdersOnPage.length > 0 &&
    pendingOrdersOnPage.every(order => selectedOrderIds.includes(order.id))

  function toggleOrderSelection(orderId: string) {
    setSelectedOrderIds(prev => (
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    ))
  }

  function togglePageSelection() {
    const pendingIdsOnPage = pendingOrdersOnPage.map(order => order.id)
    if (allPendingOnPageSelected) {
      setSelectedOrderIds(prev => prev.filter(id => !pendingIdsOnPage.includes(id)))
      return
    }

    setSelectedOrderIds(prev => Array.from(new Set([...prev, ...pendingIdsOnPage])))
  }

  async function handleBulkDeleteOrders() {
    if (selectedPendingOrders.length === 0) {
      alert('请先选择待发货订单')
      return
    }

    if (!confirm(`确认删除选中的 ${selectedPendingOrders.length} 个待发货订单吗？删除后会同步到云端。`)) {
      return
    }

    let deletedCount = 0
    const failedCustomers: string[] = []

    for (const order of selectedPendingOrders) {
      try {
        const deleted = enterpriseMode
          ? (await deleteEnterpriseOrder(order.id)).success
          : await window.electronAPI.deleteOrder(order.id)
        if (deleted) {
          deletedCount += 1
        } else {
          failedCustomers.push(order.customerName)
        }
      } catch {
        failedCustomers.push(order.customerName)
      }
    }

    if (deletedCount === 0) {
      alert(`未能删除订单：${failedCustomers.join('、') || '请选择待发货订单'}`)
      return
    }

    if (enterpriseMode) {
      await refreshAfterEnterpriseMutation()
    } else {
      await syncOrdersAfterMutation()
    }
    setSelectedOrderIds(prev => prev.filter(id => !selectedPendingOrders.some(order => order.id === id)))
    await loadData(enterpriseMode)

    if (failedCustomers.length > 0) {
      alert(`已删除 ${deletedCount} 个订单，以下订单删除失败：${failedCustomers.join('、')}`)
    }
  }

  // Count for each filter
  const today = getTodayStr()
  const tomorrow = getTomorrowStr()
  const counts = useMemo(() => ({
    all: allOrders.length,
    pending: allOrders.filter(o => o.status === 'pending').length,
    expiring: allOrders.filter(o =>
      o.status !== 'returned' && (o.rentalEnd === today || o.rentalEnd === tomorrow)
    ).length,
    dispatched: allOrders.filter(o => o.status === 'dispatched').length,
    returned: allOrders.filter(o => o.status === 'returned').length,
    todayShip: allOrders.filter(o => o.status === 'pending' && o.shipmentDate === today).length
  }), [allOrders, today, tomorrow])

  return (
    <div className="order-panel" style={{ padding: '0 28px 20px', overflowY: 'auto', flex: 1 }}>
      {/* Dispatch success notification */}
      {dispatchOk && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px',
          background: '#e8f5e9', borderRadius: '10px', marginBottom: '12px',
          fontSize: '13px', flexWrap: 'wrap'
        }}>
          <span>✅ <strong>{dispatchOk.name}</strong> 发货成功</span>
          <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
            {dispatchOk.device} · {dispatchOk.serial} · {dispatchOk.tracking}
          </span>
          <button
            className="settings-panel__btn settings-panel__btn--primary"
            style={{ fontSize: '11px', height: '26px', padding: '0 10px', marginLeft: 'auto' }}
            onClick={() => {
              const text = `发货信息：\n客户：${dispatchOk.name}\n设备：${dispatchOk.device}\n序列号：${dispatchOk.serial}\n快递单号：${dispatchOk.tracking}`
              navigator.clipboard.writeText(text).then(() => {
                const btn = document.activeElement as HTMLElement
                if (btn) { btn.textContent = '已复制'; setTimeout(() => { btn.textContent = '📋 复制' }, 1500) }
              })
            }}
          >
            📋 复制
          </button>
        </div>
      )}

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
          当前为企业视图，正在查看「{enterpriseName}」的全部订单。企业成员的改动默认每 {CLOUD_SYNC_INTERVAL_MINUTES} 分钟自动刷新一次，也可以点击顶部“手动同步”立即查看最新数据。
        </div>
      )}
      {/* Top bar: add order + today shortcut */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="settings-panel__btn settings-panel__btn--secondary"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? '取消' : '+ 手动添加订单'}
          </button>
          <button
            className="settings-panel__btn settings-panel__btn--primary"
            onClick={goToday}
            style={{ fontSize: '12px', height: '30px' }}
          >
            📦 今天发货 ({counts.todayShip})
          </button>
          <button
            className="settings-panel__btn settings-panel__btn--secondary"
            style={{ fontSize: '12px', height: '30px' }}
            onClick={togglePageSelection}
            disabled={pendingOrdersOnPage.length === 0}
          >
            {allPendingOnPageSelected ? '取消本页选择' : '选择本页待发货'}
          </button>
          <button
            className="settings-panel__btn settings-panel__btn--secondary"
            style={{ fontSize: '12px', height: '30px' }}
            onClick={() => setSelectedOrderIds([])}
            disabled={selectedOrderIds.length === 0}
          >
            清空已选 ({selectedOrderIds.length})
          </button>
          <button
            className="settings-panel__btn settings-panel__btn--secondary"
            style={{ fontSize: '12px', height: '30px', color: '#c62828', borderColor: '#ffcdd2' }}
            onClick={() => { handleBulkDeleteOrders().catch(() => {}) }}
            disabled={selectedPendingOrders.length === 0}
          >
            删除已选 ({selectedPendingOrders.length})
          </button>
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>仅待发货订单支持批量删除</span>
        </div>
      </div>

      {/* Add order form */}
      {showAddForm && (
        <div className="order-form" style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: '16px', marginBottom: '16px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input className="form-input" style={{ flex: 1 }} placeholder="客户姓名" value={newName} onChange={e => setNewName(e.target.value)} />
            <input className="form-input" style={{ flex: 1 }} placeholder="电话" value={newPhone} onChange={e => setNewPhone(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input className="form-input" style={{ flex: 1 }} placeholder="地址" value={newAddress} onChange={e => setNewAddress(e.target.value)} />
            <input className="form-input" style={{ width: '120px' }} placeholder="型号" value={newModel} onChange={e => setNewModel(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <div style={{ minWidth: '160px', flex: 1 }}>
              <label className="form-label" style={{ marginBottom: '4px', display: 'block' }}>发货日</label>
              <input className="form-input" style={{ width: '100%' }} type="date" value={newShipmentDate} onChange={e => setNewShipmentDate(e.target.value)} />
            </div>
            <div style={{ minWidth: '160px', flex: 1 }}>
              <label className="form-label" style={{ marginBottom: '4px', display: 'block' }}>起租日</label>
              <input className="form-input" style={{ width: '100%' }} type="date" value={newRentalStart} onChange={e => setNewRentalStart(e.target.value)} />
            </div>
            <div style={{ minWidth: '160px', flex: 1 }}>
              <label className="form-label" style={{ marginBottom: '4px', display: 'block' }}>到期日</label>
              <input className="form-input" style={{ width: '100%' }} type="date" value={newRentalEnd} onChange={e => setNewRentalEnd(e.target.value)} />
            </div>
          </div>
          <button className="settings-panel__btn settings-panel__btn--primary" onClick={handleCreateOrder} disabled={creating}>
            {creating ? '创建中...' : '创建订单'}
          </button>
        </div>
      )}

      {/* Search + Filter bar */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          className="form-input"
          style={{ width: '200px', height: '30px', fontSize: '12px' }}
          placeholder="🔍 搜索客户姓名 / 手机号 / 客服"
          value={searchQuery}
          onChange={e => changeSearch(e.target.value)}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>📅 发货日</span>
          <input
            type="date"
            className="form-input"
            style={{ height: '30px', fontSize: '12px', width: '140px' }}
            value={dispatchDate}
            onChange={e => changeDispatchDate(e.target.value)}
          />
          {dispatchDate && (
            <button
              className="settings-panel__btn settings-panel__btn--secondary"
              style={{ fontSize: '11px', height: '26px', padding: '0 8px' }}
              onClick={() => changeDispatchDate('')}
              title="清除日期筛选"
            >
              ✕
            </button>
          )}
        </div>
        <div className="filter-bar--segmented" style={{ marginBottom: '0' }}>
        {filterOptions.map(f => (
          <button
            key={f.key}
            className={`filter-btn ${filter === f.key ? 'filter-btn--active' : ''}`}
            onClick={() => changeFilter(f.key)}
          >
            {f.label} ({counts[f.key]})
          </button>
        ))}
        </div>
      </div>

      {/* Order list */}
      <div className="order-list">
        {orders.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)', fontSize: '13px' }}>
            {allOrders.length === 0
              ? '暂无订单数据，请先点击工具栏「读取数据」从 Excel 导入'
              : filter === 'pending' && !dispatchDate
              ? '暂无待发货订单，请通过「读取数据」从 Excel 导入，或手动添加\n提示：点击「📦 今天发货」快速查看今日需发订单'
              : filter === 'expiring'
              ? `没有即将到期的订单（今天 ${today} ~ 明天 ${tomorrow}）`
              : filter === 'pending' && dispatchDate
              ? `没有预计 ${dispatchDate} 发货的待处理订单`
              : dispatchDate
              ? `没有 ${dispatchDate} 的匹配订单`
              : '暂无匹配的订单'}
          </div>
        )}

        {orders.map(order => (
          <div key={order.id} className="order-card">
            <div style={{ width: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {order.status === 'pending' && (
                <input
                  type="checkbox"
                  checked={selectedOrderIds.includes(order.id)}
                  onChange={() => toggleOrderSelection(order.id)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--accent)' }}
                  title={`选择订单 ${order.customerName}`}
                />
              )}
            </div>
            <div className="order-card__info">
              <div className="order-card__name">
                {order.customerName}
                <span className={`order-card__status order-card__status--${order.status}`}>
                  {order.status === 'pending' ? '待发货' : order.status === 'dispatched' ? '已发货' : '已归还'}
                </span>
              </div>
              <div className="order-card__meta">
                {order.platform && <span>{order.platform}</span>}
                {order.csRep && <span> · 客服 {order.csRep}</span>}
                <span> · {order.customerPhone}</span>
                <span> · {order.deviceId}</span>
                {enterpriseMode && order.ownerEmail ? <span> · 所属 {order.ownerEmail}</span> : null}
              </div>
              <div className="order-card__address">{order.customerAddress}</div>
              {order.remarks && (
                <div style={{ fontSize: '11px', color: '#e67e22', marginTop: '2px' }}>📝 {order.remarks}</div>
              )}

              {/* Dates: always show on pending/dispatched orders */}
              {order.status === 'pending' && (order.shipmentDate || order.rentalStart || order.rentalEnd) && (
                <div className="order-card__dates">
                  {order.shipmentDate && <span>📦 发货日 {order.shipmentDate}</span>}
                  {order.shipmentDate && (order.rentalStart || order.rentalEnd) && <span> · </span>}
                  {order.rentalStart && <span>起租日 {order.rentalStart}</span>}
                  {order.rentalStart && order.rentalEnd && <span> · </span>}
                  {order.rentalEnd && <span>到期日 {order.rentalEnd}</span>}
                </div>
              )}

              {order.status === 'dispatched' && (
                <>
                  {(order.shipmentDate || order.rentalStart || order.rentalEnd) && (
                    <div className="order-card__dates">
                      {order.shipmentDate && <span>发货日 {order.shipmentDate}</span>}
                      {order.shipmentDate && (order.rentalStart || order.rentalEnd) && <span> · </span>}
                      {order.rentalStart && <span>起租日 {order.rentalStart}</span>}
                      {order.rentalStart && order.rentalEnd && <span> · </span>}
                      {order.rentalEnd && <span>到期日 {order.rentalEnd}</span>}
                    </div>
                  )}
                  <div className="order-card__detail">
                    序列号: {order.serialNumber} · 快递: {order.trackingNumber} · 实际发货: {order.dispatchDate}
                  </div>
                </>
              )}

              {order.status === 'returned' && (
                <div className="order-card__detail">
                  序列号: {order.serialNumber} · 归还日: {order.returnDate}
                </div>
              )}
            </div>
            <div className="order-card__actions" style={{ flexDirection: 'column', gap: '6px', minWidth: '84px' }}>
              {order.status === 'pending' && (
                <>
                  <button className="settings-panel__btn settings-panel__btn--primary" style={{ fontSize: '12px', height: '30px' }} onClick={() => openDispatch(order)}>
                    发货
                  </button>
                  {(!enterpriseMode || !order.ownerEmail || order.ownerEmail === getUser()?.email) && (
                    <button className="settings-panel__btn settings-panel__btn--secondary" style={{ fontSize: '12px', height: '30px' }} onClick={() => openShareDialog(order)}>
                      分享代发
                    </button>
                  )}
                  <button className="settings-panel__btn settings-panel__btn--secondary" style={{ fontSize: '12px', height: '30px' }} onClick={() => handleDelete(order)}>
                    删除
                  </button>
                </>
              )}
              {order.status === 'dispatched' && (
                <button className="settings-panel__btn settings-panel__btn--secondary" style={{ fontSize: '12px', height: '30px' }} onClick={() => handleReturn(order.id)}>
                  归还
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px',
          padding: '16px 0', marginTop: '8px'
        }}>
          <button
            className="settings-panel__btn settings-panel__btn--secondary"
            style={{ fontSize: '12px', height: '28px', padding: '0 12px' }}
            onClick={() => setPage(1)}
            disabled={safePage === 1}
          >
            « 首页
          </button>
          <button
            className="settings-panel__btn settings-panel__btn--secondary"
            style={{ fontSize: '12px', height: '28px', padding: '0 12px' }}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={safePage === 1}
          >
            ‹ 上一页
          </button>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            第 {safePage} / {totalPages} 页（共 {filteredOrders.length} 条）
          </span>
          <button
            className="settings-panel__btn settings-panel__btn--secondary"
            style={{ fontSize: '12px', height: '28px', padding: '0 12px' }}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
          >
            下一页 ›
          </button>
          <button
            className="settings-panel__btn settings-panel__btn--secondary"
            style={{ fontSize: '12px', height: '28px', padding: '0 12px' }}
            onClick={() => setPage(totalPages)}
            disabled={safePage === totalPages}
          >
            末页 »
          </button>
        </div>
      )}

      {/* Dispatch dialog (modal) */}
      {dispatchTarget && (
        <div className="dispatch-overlay" onClick={() => setDispatchTarget(null)}>
          <div className="dispatch-dialog" onClick={e => e.stopPropagation()}>
            <div className="dispatch-dialog__title">发货确认</div>

            <div className="form-group">
              <label className="form-label">设备序列号</label>
              <input
                className="form-input"
                style={{ width: '100%' }}
                placeholder="输入或选择序列号"
                value={serialNumber}
                onChange={e => setSerialNumber(e.target.value)}
                autoFocus
              />
            </div>

            {/* Device suggestions */}
            {dispatchTarget && (
              <div className="device-suggestions">
                {idleDevices.length === 0 ? (
                  <div className="device-suggestions__empty">
                    没有空闲设备，请先入库
                  </div>
                ) : availableDevices.length > 0 ? (
                  availableDevices.map(d => (
                    <div
                      key={d.id}
                      className={`device-suggestion ${serialNumber.trim() === d.serialNumber ? 'device-suggestion--selected' : ''}`}
                      onClick={() => setSerialNumber(d.serialNumber)}
                    >
                      <span className="device-suggestion__serial">{d.serialNumber}</span>
                      <span className="device-suggestion__meta">{d.deviceId} · 入库 {d.createdAt}</span>
                    </div>
                  ))
                ) : serialNumber.trim() ? (
                  <div className="device-suggestions__empty">
                    未匹配到包含 "{serialNumber}" 的空闲设备
                  </div>
                ) : null}
              </div>
            )}

            {serialExistsButUnavailable && matchedDevice && (
              <div style={{
                marginTop: '10px',
                padding: '10px 12px',
                borderRadius: '10px',
                background: '#fff4e5',
                border: '1px solid #ffd9a8',
                fontSize: '12px',
                color: '#b26a00',
                lineHeight: 1.7
              }}>
                序列号「{matchedDevice.serialNumber}」已经存在，但当前状态是「{matchedDevice.status === 'renting' ? '租赁中' : matchedDevice.status}」，暂时不能直接发货。
              </div>
            )}

            {!matchedDevice && normalizedSerialNumber && activeDispatchOrder && (
              <div style={{
                marginTop: '10px',
                padding: '10px 12px',
                borderRadius: '10px',
                background: '#eef7ff',
                border: '1px solid #cfe3ff',
                fontSize: '12px',
                color: '#1d4ed8',
                lineHeight: 1.7
              }}>
                库存中没有序列号「{normalizedSerialNumber}」，可以按当前订单型号「{activeDispatchOrder.deviceId || '标准'}」直接入库并发货。
              </div>
            )}

            <div className="form-group">
              <label className="form-label">快递单号</label>
              <input className="form-input" style={{ width: '100%' }} placeholder="输入快递单号" value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} />
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button className="settings-panel__btn settings-panel__btn--secondary" onClick={() => setDispatchTarget(null)}>取消</button>
              {canAddAndDispatch && (
                <button
                  className="settings-panel__btn settings-panel__btn--secondary"
                  onClick={handleAddAndDispatch}
                  disabled={dispatching}
                >
                  {dispatching ? '处理中...' : '入库并发货'}
                </button>
              )}
              <button
                className="settings-panel__btn settings-panel__btn--primary"
                onClick={handleDispatch}
                disabled={dispatching || !canDispatchExistingDevice}
              >
                {dispatching ? '发货中...' : '确认发货'}
              </button>
            </div>
          </div>
        </div>
      )}

      {shareTarget && (
        <div className="dispatch-overlay" onClick={() => setShareTarget(null)}>
          <div className="dispatch-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="dispatch-dialog__title">分享给好友代发</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: '12px' }}>
              客户：<strong>{shareTarget.customerName}</strong>
              <br />
              型号：{shareTarget.deviceId} · 发货日 {shareTarget.shipmentDate || '-'} · 到期日 {shareTarget.rentalEnd || '-'}
            </div>

            {shareMsg && (
              <div style={{
                marginBottom: '12px',
                padding: '8px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                background: shareMsg.type === 'success' ? '#e8f5e9' : '#ffebee',
                color: shareMsg.type === 'success' ? '#2e7d32' : '#c62828'
              }}>
                {shareMsg.text}
              </div>
            )}

            <div style={{ background: 'var(--bg-tertiary)', borderRadius: '10px', padding: '12px', maxHeight: '220px', overflowY: 'auto' }}>
              {loadingFriends ? (
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>正在加载好友列表...</div>
              ) : friends.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: 1.8 }}>
                  你还没有好友。先去“好友代发”页面添加好友，再回来分享订单。
                </div>
              ) : (
                friends.map(friend => (
                  <div key={friend.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>{friend.email}</div>
                    <button
                      className="settings-panel__btn settings-panel__btn--primary"
                      style={{ fontSize: '12px', height: '30px' }}
                      onClick={() => handleShareToFriend(friend.id)}
                      disabled={sharingFriendId === friend.id}
                    >
                      {sharingFriendId === friend.id ? '分享中...' : '分享'}
                    </button>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button className="settings-panel__btn settings-panel__btn--secondary" onClick={() => setShareTarget(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
