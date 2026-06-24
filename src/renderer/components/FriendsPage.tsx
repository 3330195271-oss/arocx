import { useEffect, useMemo, useState } from 'react'
import {
  acceptFriendRequest,
  dispatchSharedOrder,
  getFriendList,
  getFriendRequests,
  getSharedOrderDispatchOptions,
  getSharedOrders,
  getUser,
  rejectFriendRequest,
  removeFriend,
  sendFriendRequest
} from '../services/api-client'

type SharedOrder = {
  id: string
  customer_name?: string
  customerName?: string
  customer_phone?: string
  customerPhone?: string
  customer_address?: string
  customerAddress?: string
  device_id?: string
  deviceId?: string
  shipment_date?: string
  shipmentDate?: string
  rental_start?: string
  rentalStart?: string
  rental_end?: string
  rentalEnd?: string
  status: string
  owner_email: string
  shared_at?: string
}

type DispatchDevice = {
  id: string
  serial_number?: string
  serialNumber?: string
  device_id?: string
  deviceId?: string
  created_at?: string
  createdAt?: string
}

function statusLabel(status: string): string {
  if (status === 'dispatched') return '已发货'
  if (status === 'returned') return '已归还'
  return '待发货'
}

export function FriendsPage(): JSX.Element {
  const [addEmail, setAddEmail] = useState('')
  const [adding, setAdding] = useState(false)
  const [addMsg, setAddMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [requests, setRequests] = useState<any[]>([])
  const [friends, setFriends] = useState<any[]>([])
  const [sharedOrders, setSharedOrders] = useState<SharedOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [dispatchTarget, setDispatchTarget] = useState<SharedOrder | null>(null)
  const [dispatchDevices, setDispatchDevices] = useState<DispatchDevice[]>([])
  const [serialNumber, setSerialNumber] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [loadingDispatch, setLoadingDispatch] = useState(false)
  const [dispatching, setDispatching] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [reqData, friendData, sharedData] = await Promise.all([
        getFriendRequests(),
        getFriendList(),
        getSharedOrders()
      ])
      setRequests(reqData.requests)
      setFriends(friendData.friends)
      setSharedOrders(sharedData.orders || [])
    } catch {
      setAddMsg({ type: 'error', text: '加载好友协作数据失败' })
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd() {
    if (!addEmail.trim()) return
    setAdding(true)
    setAddMsg(null)
    try {
      const result = await sendFriendRequest(addEmail.trim())
      setAddMsg({ type: 'success', text: result.message })
      setAddEmail('')
    } catch (err: any) {
      setAddMsg({ type: 'error', text: err.message })
    } finally {
      setAdding(false)
    }
  }

  async function handleAccept(id: number) {
    await acceptFriendRequest(id)
    loadData()
  }

  async function handleReject(id: number) {
    await rejectFriendRequest(id)
    loadData()
  }

  async function handleRemove(friendId: number) {
    if (!confirm('确定删除该好友？')) return
    await removeFriend(friendId)
    loadData()
  }

  async function openDispatchDialog(order: SharedOrder) {
    setDispatchTarget(order)
    setDispatchDevices([])
    setSerialNumber('')
    setTrackingNumber('')
    setLoadingDispatch(true)
    setAddMsg(null)

    try {
      const result = await getSharedOrderDispatchOptions(order.id)
      setDispatchDevices(result.devices || [])
    } catch (error: any) {
      setAddMsg({ type: 'error', text: error.message || '获取代发设备失败' })
      setDispatchTarget(null)
    } finally {
      setLoadingDispatch(false)
    }
  }

  async function handleSharedDispatch() {
    if (!dispatchTarget || !serialNumber.trim() || !trackingNumber.trim()) return
    setDispatching(true)
    try {
      const result = await dispatchSharedOrder(dispatchTarget.id, serialNumber.trim(), trackingNumber.trim())
      setAddMsg({ type: 'success', text: result.message || '代发成功' })
      setDispatchTarget(null)
      await loadData()
    } catch (error: any) {
      setAddMsg({ type: 'error', text: error.message || '代发失败' })
    } finally {
      setDispatching(false)
    }
  }

  const user = getUser()
  const isFree = user?.tier === 'free'

  const availableDispatchDevices = useMemo(() => {
    if (!serialNumber.trim()) return dispatchDevices
    const q = serialNumber.trim().toLowerCase()
    return dispatchDevices.filter(device =>
      (device.serial_number || device.serialNumber || '').toLowerCase().includes(q)
    )
  }, [dispatchDevices, serialNumber])

  if (isFree) {
    return (
      <div style={{ padding: '0 28px 20px', overflowY: 'auto', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
          <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '8px' }}>好友代发需要 Pro+ 及以上版本</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '16px', lineHeight: 1.8 }}>
            升级后可以把待发货订单分享给好友，让好友代为完成发货。
          </p>
          <button className="settings-panel__btn settings-panel__btn--primary" onClick={() => window.location.hash = '#settings'} style={{ fontSize: '13px', height: '36px' }}>
            查看升级方案
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '0 28px 20px', overflowY: 'auto', flex: 1 }}>
      <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '16px', marginTop: '4px' }}>👥 好友代发</h3>

      <div style={{ background: 'linear-gradient(135deg, #7b1fa2, #5b3cc4)', borderRadius: '14px', padding: '22px 24px', marginBottom: '16px', color: '#fff' }}>
        <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>把待发货订单交给好友协助处理</div>
        <div style={{ fontSize: '12px', opacity: 0.84, lineHeight: 1.8 }}>
          在订单管理里分享待发货订单后，好友会在这里看到并可直接帮你完成发货。
        </div>
      </div>

      {/* Add Friend */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', marginBottom: '16px' }}>
        <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>添加好友</h4>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            className="form-input"
            style={{ flex: 1 }}
            placeholder="输入好友的注册邮箱"
            value={addEmail}
            onChange={e => setAddEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <button className="settings-panel__btn settings-panel__btn--primary" onClick={handleAdd} disabled={adding} style={{ fontSize: '13px', height: '36px', whiteSpace: 'nowrap' }}>
            {adding ? '发送中' : '添加'}
          </button>
        </div>
        {addMsg && (
          <div style={{ marginTop: '8px', fontSize: '12px', color: addMsg.type === 'success' ? '#2e7d32' : '#c62828' }}>
            {addMsg.text}
          </div>
        )}
      </div>

      {requests.length > 0 && (
        <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', marginBottom: '16px' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>好友请求 ({requests.length})</h4>
          {requests.map(request => (
            <div key={request.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '13px' }}>{request.email}</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => handleAccept(request.id)} style={{ padding: '4px 12px', background: '#2e7d32', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>接受</button>
                <button onClick={() => handleReject(request.id)} style={{ padding: '4px 12px', background: '#c62828', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>拒绝</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.1fr)', gap: '16px' }}>
        <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>我的好友 ({friends.length})</h4>
          {loading ? (
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', padding: '10px 0' }}>加载中...</div>
          ) : friends.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', padding: '10px 0', lineHeight: 1.8 }}>
              还没有好友。先添加好友，后续在订单管理里就能把待发货订单分享给他们。
            </div>
          ) : (
            friends.map(friend => (
              <div key={friend.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{friend.email}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>好友自 {new Date(friend.friends_since).toLocaleDateString('zh-CN')}</div>
                </div>
                <button onClick={() => handleRemove(friend.id)} style={{ padding: '4px 10px', background: 'none', border: '1px solid #c62828', color: '#c62828', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>
                  删除
                </button>
              </div>
            ))
          )}
        </div>

        <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>分享给我的订单 ({sharedOrders.length})</h4>
          {loading ? (
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', padding: '10px 0' }}>加载中...</div>
          ) : sharedOrders.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', padding: '10px 0', lineHeight: 1.8 }}>
              还没有好友分享订单给你。对方在订单管理里点“分享代发”后，这里就会出现。
            </div>
          ) : (
            sharedOrders.map(order => (
              <div key={order.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{order.customer_name || order.customerName}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                      来自 {order.owner_email} · {order.customer_phone || order.customerPhone} · {(order.device_id || order.deviceId) || '未填写型号'}
                    </div>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                    {statusLabel(order.status)}
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                  {order.customer_address || order.customerAddress}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '6px' }}>
                  发货日 {order.shipment_date || order.shipmentDate || '-'} · 起租日 {order.rental_start || order.rentalStart || '-'} · 到期日 {order.rental_end || order.rentalEnd || '-'}
                </div>
                {order.status === 'pending' && (
                  <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="settings-panel__btn settings-panel__btn--primary" style={{ fontSize: '12px', height: '30px' }} onClick={() => openDispatchDialog(order)}>
                      帮他发货
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {dispatchTarget && (
        <div className="dispatch-overlay" onClick={() => setDispatchTarget(null)}>
          <div className="dispatch-dialog" onClick={e => e.stopPropagation()}>
            <div className="dispatch-dialog__title">好友代发</div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: '12px' }}>
              订单归属：<strong>{dispatchTarget.owner_email}</strong>
              <br />
              客户：{dispatchTarget.customer_name || dispatchTarget.customerName} · {(dispatchTarget.device_id || dispatchTarget.deviceId) || '未填写型号'}
            </div>

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

            <div className="device-suggestions">
              {loadingDispatch ? (
                <div className="device-suggestions__empty">正在读取可用设备...</div>
              ) : dispatchDevices.length === 0 ? (
                <div className="device-suggestions__empty">对方账号目前没有可代发的空闲设备</div>
              ) : availableDispatchDevices.length > 0 ? (
                availableDispatchDevices.map(device => (
                  <div
                    key={device.id}
                    className={`device-suggestion ${serialNumber.trim() === (device.serial_number || device.serialNumber || '') ? 'device-suggestion--selected' : ''}`}
                    onClick={() => setSerialNumber(device.serial_number || device.serialNumber || '')}
                  >
                    <span className="device-suggestion__serial">{device.serial_number || device.serialNumber}</span>
                    <span className="device-suggestion__meta">{(device.device_id || device.deviceId) || '未填写型号'} · 入库 {device.created_at || device.createdAt || '-'}</span>
                  </div>
                ))
              ) : (
                <div className="device-suggestions__empty">没有匹配到包含 “{serialNumber}” 的空闲设备</div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">快递单号</label>
              <input
                className="form-input"
                style={{ width: '100%' }}
                placeholder="输入快递单号"
                value={trackingNumber}
                onChange={e => setTrackingNumber(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button className="settings-panel__btn settings-panel__btn--secondary" onClick={() => setDispatchTarget(null)}>
                取消
              </button>
              <button
                className="settings-panel__btn settings-panel__btn--primary"
                onClick={handleSharedDispatch}
                disabled={dispatching || !serialNumber.trim() || !trackingNumber.trim()}
              >
                {dispatching ? '代发中...' : '确认代发'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
