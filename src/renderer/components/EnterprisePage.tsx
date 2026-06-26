import { useEffect, useMemo, useState } from 'react'
import {
  createEnterprise,
  getEnterpriseDevices,
  getEnterpriseMembers,
  getEnterpriseOrders,
  getMyEnterprise,
  getUser,
  joinEnterprise,
  kickEnterpriseMember,
  leaveEnterprise,
  regenerateInviteCode
} from '../services/api-client'
import { buildElectronSyncOptions, pullNow } from '../services/sync-service'

type EnterpriseInfo = {
  id: number
  name: string
  invite_code: string
  owner_id: number
  role: string
  created_at: string
}

type EnterpriseMember = {
  id: number
  email: string
  role: string
  joined_at: string
}

type EnterpriseOrder = {
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
}

type EnterpriseDevice = {
  id: string
  serial_number?: string
  serialNumber?: string
  device_id?: string
  deviceId?: string
  status: string
  created_at?: string
  createdAt?: string
  owner_email: string
}

function roleLabel(role: string): string {
  return role === 'admin' ? '管理员' : '成员'
}

function orderStatusLabel(status: string): string {
  if (status === 'dispatched') return '已发货'
  if (status === 'returned') return '已归还'
  return '待发货'
}

function deviceStatusLabel(status: string): string {
  return status === 'renting' ? '租用中' : '空闲'
}

export function EnterprisePage(): JSX.Element {
  const user = getUser()
  const isFree = user?.tier === 'free'

  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [enterprise, setEnterprise] = useState<EnterpriseInfo | null>(null)
  const [members, setMembers] = useState<EnterpriseMember[]>([])
  const [orders, setOrders] = useState<EnterpriseOrder[]>([])
  const [devices, setDevices] = useState<EnterpriseDevice[]>([])
  const [myRole, setMyRole] = useState('')
  const [createName, setCreateName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function loadData(showRefreshing = false) {
    if (showRefreshing) setRefreshing(true)
    else setLoading(true)

    try {
      const enterpriseData = await getMyEnterprise()
      const nextEnterprise = enterpriseData.enterprise as EnterpriseInfo | null
      setEnterprise(nextEnterprise)

      if (!nextEnterprise) {
        setMembers([])
        setOrders([])
        setDevices([])
        setMyRole('')
        return
      }

      const [memberData, orderData, deviceData] = await Promise.all([
        getEnterpriseMembers(),
        getEnterpriseOrders(),
        getEnterpriseDevices()
      ])

      setMembers(memberData.members)
      setMyRole(memberData.myRole)
      setOrders(orderData.orders || [])
      setDevices(deviceData.devices || [])
    } catch (error: any) {
      setMsg({ type: 'error', text: error.message || '加载企业协作数据失败' })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadData().catch(() => setLoading(false))
  }, [])

  async function handleCreate() {
    if (!createName.trim()) return
    setCreating(true)
    setMsg(null)
    try {
      await createEnterprise(createName.trim())
      setCreateName('')
      setMsg({ type: 'success', text: '企业已创建，成员现在可以通过邀请码加入。' })
      await loadData()
    } catch (error: any) {
      setMsg({ type: 'error', text: error.message || '创建企业失败' })
    } finally {
      setCreating(false)
    }
  }

  async function handleJoin() {
    if (!joinCode.trim()) return
    setJoining(true)
    setMsg(null)
    try {
      const result = await joinEnterprise(joinCode.trim())
      setJoinCode('')
      await pullNow(buildElectronSyncOptions())
      setMsg({ type: 'success', text: result.message })
      await loadData()
    } catch (error: any) {
      setMsg({ type: 'error', text: error.message || '加入企业失败' })
    } finally {
      setJoining(false)
    }
  }

  async function handleLeave() {
    if (!confirm('确认退出当前企业？退出后将无法继续查看企业共享数据。')) return
    try {
      await leaveEnterprise()
      await pullNow(buildElectronSyncOptions())
      setMsg({ type: 'success', text: '已退出企业。' })
      await loadData()
    } catch (error: any) {
      setMsg({ type: 'error', text: error.message || '退出企业失败' })
    }
  }

  async function handleKick(userId: number) {
    if (!confirm('确认移除该成员？')) return
    try {
      await kickEnterpriseMember(userId)
      setMsg({ type: 'success', text: '成员已移除。' })
      await loadData(true)
    } catch (error: any) {
      setMsg({ type: 'error', text: error.message || '移除成员失败' })
    }
  }

  async function handleRegenerateCode() {
    try {
      const result = await regenerateInviteCode()
      setEnterprise(prev => prev ? { ...prev, invite_code: result.inviteCode } : prev)
      setMsg({ type: 'success', text: '邀请码已刷新。' })
    } catch (error: any) {
      setMsg({ type: 'error', text: error.message || '刷新邀请码失败' })
    }
  }

  async function handleCopyCode() {
    if (!enterprise?.invite_code) return
    try {
      await navigator.clipboard.writeText(enterprise.invite_code)
      setMsg({ type: 'success', text: '邀请码已复制。' })
    } catch {
      setMsg({ type: 'error', text: '复制邀请码失败，请手动复制。' })
    }
  }

  const summary = useMemo(() => {
    const pendingOrders = orders.filter(order => order.status === 'pending').length
    const dispatchedOrders = orders.filter(order => order.status === 'dispatched').length
    const idleDevices = devices.filter(device => device.status === 'idle').length

    return {
      memberCount: members.length,
      orderCount: orders.length,
      pendingOrders,
      dispatchedOrders,
      deviceCount: devices.length,
      idleDevices
    }
  }, [devices, members.length, orders])

  if (isFree) {
    return (
      <div style={{ padding: '0 28px 20px', overflowY: 'auto', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: '420px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
          <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '8px' }}>企业协作需要 Pro+ 及以上版本</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', lineHeight: 1.8 }}>
            升级后可以创建企业、邀请成员加入，并共享订单与库存数据。
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return <div style={{ padding: '20px 28px', color: 'var(--text-tertiary)', fontSize: '13px' }}>加载企业协作数据中...</div>
  }

  return (
    <div style={{ padding: '0 28px 20px', overflowY: 'auto', flex: 1 }}>
      <h3 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '16px', marginTop: '4px' }}>🏢 企业协作</h3>

      <div style={{ background: 'linear-gradient(135deg, #0f766e, #155e75)', borderRadius: '14px', padding: '24px', marginBottom: '16px', color: '#fff' }}>
        <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>
          {enterprise ? enterprise.name : '创建你的企业空间'}
        </div>
        <div style={{ fontSize: '12px', opacity: 0.86, lineHeight: 1.8 }}>
          {enterprise
            ? `当前 ${members.length} 位成员已接入，订单与库存数据会在企业成员间共享查看。`
            : '创建企业后，你可以把邀请码发给同事，让他们加入后共享订单与库存数据。'}
        </div>
      </div>

      {msg && (
        <div style={{
          marginBottom: '16px',
          padding: '10px 14px',
          borderRadius: '10px',
          fontSize: '12px',
          background: msg.type === 'success' ? '#e8f5e9' : '#ffebee',
          color: msg.type === 'success' ? '#2e7d32' : '#c62828'
        }}>
          {msg.text}
        </div>
      )}

      {!enterprise ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
          <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>创建企业</h4>
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '12px', lineHeight: 1.8 }}>
              适合你是数据拥有方，需要把订单和库存共享给同事查看。
            </p>
            <input
              className="form-input"
              style={{ width: '100%', marginBottom: '12px' }}
              placeholder="输入企业名称"
              value={createName}
              onChange={e => setCreateName(e.target.value)}
            />
            <button className="settings-panel__btn settings-panel__btn--primary" onClick={handleCreate} disabled={creating}>
              {creating ? '创建中...' : '创建企业'}
            </button>
          </div>

          <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>加入企业</h4>
            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '12px', lineHeight: 1.8 }}>
              如果同事已经创建好企业，直接输入邀请码就能加入并查看共享数据。
            </p>
            <input
              className="form-input"
              style={{ width: '100%', marginBottom: '12px', textTransform: 'uppercase' }}
              placeholder="输入邀请码"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
            />
            <button className="settings-panel__btn settings-panel__btn--primary" onClick={handleJoin} disabled={joining}>
              {joining ? '加入中...' : '加入企业'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '6px' }}>
                  {enterprise.name}
                  <span style={{
                    marginLeft: '10px',
                    fontSize: '11px',
                    padding: '3px 8px',
                    borderRadius: '999px',
                    background: myRole === 'admin' ? '#d1fae5' : '#e0f2fe',
                    color: myRole === 'admin' ? '#047857' : '#0369a1'
                  }}>
                    {roleLabel(myRole || enterprise.role)}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                  创建时间：{new Date(enterprise.created_at).toLocaleDateString('zh-CN')}
                </div>
                <div style={{ fontSize: '13px', marginTop: '10px' }}>
                  邀请码：<strong style={{ letterSpacing: '1px' }}>{enterprise.invite_code}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button className="settings-panel__btn settings-panel__btn--secondary" onClick={handleCopyCode}>
                  复制邀请码
                </button>
                {myRole === 'admin' && (
                  <button className="settings-panel__btn settings-panel__btn--secondary" onClick={handleRegenerateCode}>
                    刷新邀请码
                  </button>
                )}
                <button className="settings-panel__btn settings-panel__btn--secondary" onClick={() => loadData(true)} disabled={refreshing}>
                  {refreshing ? '刷新中...' : '刷新数据'}
                </button>
                <button className="settings-panel__btn settings-panel__btn--secondary" onClick={handleLeave}>
                  退出企业
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: '企业成员', value: summary.memberCount, color: '#0f766e' },
              { label: '共享订单', value: summary.orderCount, color: '#e67e22' },
              { label: '待发货', value: summary.pendingOrders, color: '#2563eb' },
              { label: '空闲库存', value: summary.idleDevices, color: '#2e7d32' }
            ].map(item => (
              <div key={item.label} style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '16px 18px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: item.color }}>{item.value}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>{item.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px', marginBottom: '16px' }}>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px' }}>企业成员 ({members.length})</h4>
              {members.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>暂无成员</div>
              ) : members.map(member => (
                <div key={member.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>{member.email}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                      {roleLabel(member.role)} · 加入于 {new Date(member.joined_at).toLocaleDateString('zh-CN')}
                    </div>
                  </div>
                  {myRole === 'admin' && member.role !== 'admin' && (
                    <button
                      style={{ padding: '4px 10px', background: 'none', border: '1px solid #c62828', color: '#c62828', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', height: '28px' }}
                      onClick={() => handleKick(member.id)}
                    >
                      移除
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px' }}>共享库存 ({summary.deviceCount})</h4>
              {devices.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>企业内还没有可查看的库存数据</div>
              ) : devices.slice(0, 10).map(device => (
                <div key={device.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{device.serial_number || device.serialNumber}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                        {(device.device_id || device.deviceId) || '未填写型号'} · {device.owner_email}
                      </div>
                    </div>
                    <div style={{ fontSize: '11px', color: device.status === 'idle' ? '#2e7d32' : '#e67e22', whiteSpace: 'nowrap' }}>
                      {deviceStatusLabel(device.status)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px' }}>共享订单 ({orders.length})</h4>
            {orders.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>企业内还没有共享订单数据</div>
            ) : orders.slice(0, 16).map(order => (
              <div key={order.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>
                      {order.customer_name || order.customerName}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                      {order.owner_email} · {order.customer_phone || order.customerPhone} · {(order.device_id || order.deviceId) || '未填写型号'}
                    </div>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                    {orderStatusLabel(order.status)}
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                  {order.customer_address || order.customerAddress}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '6px' }}>
                  发货日 {order.shipment_date || order.shipmentDate || '-'} · 起租日 {order.rental_start || order.rentalStart || '-'} · 到期日 {order.rental_end || order.rentalEnd || '-'}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
