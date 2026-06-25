import { useEffect, useState, useMemo } from 'react'
import { deleteEnterpriseDevice, isLoggedIn } from '../services/api-client'
import {
  getEnterpriseWorkspaceInfo,
  loadEnterpriseDevices,
  type WorkspaceDevice
} from '../services/enterprise-workspace'
import { syncNow, pullNow, buildElectronSyncOptions } from '../services/sync-service'
import type { HomeInventoryFilter } from '../types/home-navigation'

const PAGE_SIZE = 10

interface DeviceInventoryProps {
  initialFilter?: HomeInventoryFilter
}

export function DeviceInventory({ initialFilter = 'all' }: DeviceInventoryProps): JSX.Element {
  const [devices, setDevices] = useState<WorkspaceDevice[]>([])
  const [filter, setFilter] = useState<HomeInventoryFilter>(initialFilter)
  const [serial, setSerial] = useState('')
  const [model, setModel] = useState('')
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [modelSearch, setModelSearch] = useState('')
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([])
  const [enterpriseMode, setEnterpriseMode] = useState(false)
  const [enterpriseName, setEnterpriseName] = useState('')

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      const workspace = await getEnterpriseWorkspaceInfo()
      if (cancelled) return
      setEnterpriseMode(workspace.enabled)
      setEnterpriseName(workspace.enterpriseName)
      setFilter(initialFilter)
      await loadDevices(initialFilter === 'all' ? undefined : initialFilter, workspace.enabled)
    }

    bootstrap().catch(() => {})
    return () => { cancelled = true }
  }, [initialFilter])

  async function loadDevices(status?: string, useEnterpriseMode = enterpriseMode) {
    const nextDevices = useEnterpriseMode
      ? await loadEnterpriseDevices()
      : await window.electronAPI.getDevices(status)

    const filteredDevices = useEnterpriseMode && status
      ? nextDevices.filter(device => device.status === status)
      : nextDevices

    setDevices(filteredDevices)
    setSelectedDeviceIds(prev => prev.filter(id => filteredDevices.some(device => device.id === id)))
  }

  function handleFilter(nextFilter: HomeInventoryFilter) {
    setFilter(nextFilter)
    setPage(1)
    setSelectedDeviceIds([])
    loadDevices(nextFilter === 'all' ? undefined : nextFilter).catch(() => {})
  }

  async function refreshAfterEnterpriseMutation(successMessage: string) {
    try {
      await pullNow(buildElectronSyncOptions())
    } catch {
      // Enterprise list is fetched from server directly; local pull failure should not block refresh.
    }

    await loadDevices(filter === 'all' ? undefined : filter, true)
    setImportMsg(successMessage)
  }

  async function syncInventoryState(successMessage: string): Promise<string> {
    if (!isLoggedIn()) {
      const message = `${successMessage}，当前未登录，未同步到云端`
      setImportMsg(message)
      return message
    }

    try {
      await syncNow(buildElectronSyncOptions(() => {
        loadDevices(filter === 'all' ? undefined : filter).catch(() => {})
      }))
      const message = `成功：${successMessage}，已同步到云端`
      setImportMsg(message)
      return message
    } catch (err: any) {
      const message = `${successMessage}，但同步到云端失败：${err?.message || '未知错误'}`
      setImportMsg(message)
      return message
    }
  }

  async function handleAdd() {
    if (!serial.trim() || !model.trim()) return
    setAdding(true)
    setImportMsg(null)
    try {
      await window.electronAPI.addDevice(serial, model)
      setSerial('')
      setModel('')
      setPage(1)
      await loadDevices(filter === 'all' ? undefined : filter)
      await syncInventoryState('设备入库成功')
    } catch (err: any) {
      setImportMsg(err?.message || '设备入库失败')
    } finally {
      setAdding(false)
    }
  }

  async function handleImport() {
    setImporting(true)
    setImportMsg(null)
    try {
      const result = await window.electronAPI.importDevicesFromExcel()
      if (result.imported > 0) {
        let message = `成功导入 ${result.imported} 台设备`
        setPage(1)
        await loadDevices(filter === 'all' ? undefined : filter)
        if (isLoggedIn()) {
          try {
            await syncNow(buildElectronSyncOptions(() => {
              loadDevices(filter === 'all' ? undefined : filter).catch(() => {})
            }))
            message += '，已同步到云端'
          } catch {
            message += '，但同步到云端失败'
          }
        } else {
          message += '，当前未登录，未同步到云端'
        }
        setImportMsg(message)
      } else if (result.errors.length > 0) {
        setImportMsg(result.errors.join('\n'))
      } else {
        setImportMsg('未选择文件或文件中无数据')
      }
    } catch (err: any) {
      setImportMsg(err.message || '导入失败')
    } finally {
      setImporting(false)
    }
  }

  const idle = devices.filter(device => device.status === 'idle').length
  const renting = devices.filter(device => device.status === 'renting').length

  const modelCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    devices.forEach(device => {
      counts[device.deviceId] = (counts[device.deviceId] || 0) + 1
    })
    return counts
  }, [devices])

  const filteredDevices = useMemo(() => {
    if (!modelSearch.trim()) return devices
    const query = modelSearch.trim().toLowerCase()
    return devices.filter(device => device.deviceId.toLowerCase().includes(query))
  }, [devices, modelSearch])

  const totalPages = Math.max(1, Math.ceil(filteredDevices.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)

  const pagedDevices = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return filteredDevices.slice(start, start + PAGE_SIZE)
  }, [filteredDevices, safePage])

  const selectedIdleDevices = useMemo(() => (
    devices.filter(device => selectedDeviceIds.includes(device.id) && device.status === 'idle')
  ), [devices, selectedDeviceIds])

  const selectableDeviceIdsOnPage = useMemo(() => (
    pagedDevices.filter(device => device.status === 'idle').map(device => device.id)
  ), [pagedDevices])

  const allIdleOnPageSelected = selectableDeviceIdsOnPage.length > 0 &&
    selectableDeviceIdsOnPage.every(id => selectedDeviceIds.includes(id))

  function toggleDeviceSelection(deviceId: string) {
    setSelectedDeviceIds(prev => (
      prev.includes(deviceId) ? prev.filter(id => id !== deviceId) : [...prev, deviceId]
    ))
  }

  function togglePageSelection() {
    if (allIdleOnPageSelected) {
      setSelectedDeviceIds(prev => prev.filter(id => !selectableDeviceIdsOnPage.includes(id)))
      return
    }

    setSelectedDeviceIds(prev => Array.from(new Set([...prev, ...selectableDeviceIdsOnPage])))
  }

  async function handleBulkDelete() {
    if (selectedIdleDevices.length === 0) {
      setImportMsg('请先选择要删除的空闲设备')
      return
    }

    if (!confirm(`确认删除选中的 ${selectedIdleDevices.length} 台设备吗？删除后会同步到云端。`)) {
      return
    }

    setImportMsg(null)
    let deletedCount = 0
    const failedSerials: string[] = []

    for (const device of selectedIdleDevices) {
      try {
        if (enterpriseMode) {
          await deleteEnterpriseDevice(device.id)
          deletedCount += 1
          continue
        }

        const deleted = await window.electronAPI.deleteDevice(device.id)
        if (deleted) {
          deletedCount += 1
        } else {
          failedSerials.push(device.serialNumber)
        }
      } catch {
        failedSerials.push(device.serialNumber)
      }
    }

    if (deletedCount === 0) {
      setImportMsg(`未能删除设备：${failedSerials.join('、') || '请选择可删除的空闲设备'}`)
      return
    }

    setSelectedDeviceIds(prev => prev.filter(id => !selectedIdleDevices.some(device => device.id === id)))
    setPage(1)

    if (enterpriseMode) {
      await refreshAfterEnterpriseMutation(`已从企业库存删除 ${deletedCount} 台设备`)
      if (failedSerials.length > 0) {
        setImportMsg(`已从企业库存删除 ${deletedCount} 台设备\n以下设备删除失败：${failedSerials.join('、')}`)
      }
      return
    }

    await loadDevices(filter === 'all' ? undefined : filter)
    const syncMessage = await syncInventoryState(`已删除 ${deletedCount} 台设备`)
    if (failedSerials.length > 0) {
      setImportMsg(`${syncMessage}\n以下设备删除失败：${failedSerials.join('、')}`)
    }
  }

  const inventoryFilters: Array<{ k: HomeInventoryFilter; l: string }> = [
    { k: 'all', l: '全部' },
    { k: 'idle', l: '空闲' },
    { k: 'renting', l: '租用中' }
  ]

  return (
    <div className="device-inventory" style={{ padding: '0 28px 20px', overflowY: 'auto', flex: 1 }}>
      <div className="device-summary" style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          共 <strong>{devices.length}</strong> 台{modelSearch.trim() ? <span>（筛选 {filteredDevices.length} 台）</span> : ''}
        </span>
        <span style={{ fontSize: '13px', color: '#2e7d32' }}>
          空闲 <strong>{idle}</strong>
        </span>
        <span style={{ fontSize: '13px', color: '#1565c0' }}>
          租用中 <strong>{renting}</strong>
        </span>
        {Object.keys(modelCounts).length > 0 && (
          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
            {Object.entries(modelCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([deviceModel, count]) => `${deviceModel}:${count}`).join(' · ')}
          </span>
        )}
      </div>

      {enterpriseMode && (
        <div style={{
          marginBottom: '16px',
          padding: '12px 14px',
          borderRadius: '12px',
          border: '1px solid #d8dcff',
          background: '#f6f8ff',
          fontSize: '12px',
          color: '#4f46e5',
          lineHeight: 1.7
        }}>
          当前为企业视图，正在查看「{enterpriseName}」的全部设备库存。企业成员的改动会在 30 秒内自动刷新到这里。
        </div>
      )}

      <div className="device-form" style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
        <input
          className="form-input"
          style={{ flex: 1 }}
          placeholder="序列号"
          value={serial}
          onChange={event => setSerial(event.target.value)}
          onKeyDown={event => event.key === 'Enter' && handleAdd()}
        />
        <input
          className="form-input"
          style={{ width: '120px' }}
          placeholder="型号"
          value={model}
          onChange={event => setModel(event.target.value)}
          onKeyDown={event => event.key === 'Enter' && handleAdd()}
        />
        <button className="settings-panel__btn settings-panel__btn--primary" onClick={() => { handleAdd().catch(() => {}) }} disabled={adding}>
          {adding ? '...' : '入库'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          className="settings-panel__btn settings-panel__btn--secondary"
          onClick={() => { handleImport().catch(() => {}) }}
          disabled={importing}
        >
          {importing ? '导入中...' : '📥 从表格导入设备'}
        </button>
        {importMsg && (
          <span style={{ fontSize: '12px', color: importMsg.startsWith('成功') ? '#2e7d32' : '#c62828', lineHeight: '34px', whiteSpace: 'pre-line' }}>
            {importMsg}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'center' }}>
        <div className="filter-bar--segmented" style={{ marginBottom: '0' }}>
          {inventoryFilters.map(filterItem => (
            <button
              key={filterItem.k}
              className={`filter-btn ${filter === filterItem.k ? 'filter-btn--active' : ''}`}
              onClick={() => handleFilter(filterItem.k)}
            >
              {filterItem.l}
            </button>
          ))}
        </div>
        <input
          className="form-input"
          style={{ width: '150px', height: '28px', fontSize: '12px' }}
          placeholder="搜索型号..."
          value={modelSearch}
          onChange={event => {
            setModelSearch(event.target.value)
            setSelectedDeviceIds([])
            setPage(1)
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          className="settings-panel__btn settings-panel__btn--secondary"
          style={{ fontSize: '12px', height: '30px' }}
          onClick={togglePageSelection}
          disabled={selectableDeviceIdsOnPage.length === 0}
        >
          {allIdleOnPageSelected ? '取消本页选择' : '选择本页空闲设备'}
        </button>
        <button
          className="settings-panel__btn settings-panel__btn--secondary"
          style={{ fontSize: '12px', height: '30px' }}
          onClick={() => setSelectedDeviceIds([])}
          disabled={selectedDeviceIds.length === 0}
        >
          清空已选 ({selectedDeviceIds.length})
        </button>
        <button
          className="settings-panel__btn settings-panel__btn--secondary"
          style={{ fontSize: '12px', height: '30px', color: '#c62828', borderColor: '#ffcdd2' }}
          onClick={() => { handleBulkDelete().catch(() => {}) }}
          disabled={selectedIdleDevices.length === 0}
        >
          删除已选 ({selectedIdleDevices.length})
        </button>
        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>仅空闲设备支持批量删除</span>
      </div>

      <div className="device-list">
        {devices.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)', fontSize: '13px' }}>
            暂无设备，请手动入库或从表格导入
          </div>
        )}
        {pagedDevices.map(device => (
          <div key={device.id} className="device-card">
            <div style={{ width: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {device.status === 'idle' && (
                <input
                  type="checkbox"
                  checked={selectedDeviceIds.includes(device.id)}
                  onChange={() => toggleDeviceSelection(device.id)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--accent)' }}
                  title={`选择设备 ${device.serialNumber}`}
                />
              )}
            </div>
            <div className="device-card__info">
              <div className="device-card__serial">{device.serialNumber}</div>
              <div className="device-card__meta">
                型号：{device.deviceId} · 入库 {device.createdAt}
                {enterpriseMode && device.ownerEmail ? <span> · 所属 {device.ownerEmail}</span> : null}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {device.status === 'idle' && (
                <button
                  className="settings-panel__btn settings-panel__btn--secondary"
                  style={{ fontSize: '11px', height: '26px', padding: '0 8px', color: '#c62828', borderColor: '#ffcdd2' }}
                  onClick={async () => {
                    if (!confirm(`确定要删除设备 ${device.serialNumber} 吗？`)) return
                    setImportMsg(null)

                    try {
                      if (enterpriseMode) {
                        await deleteEnterpriseDevice(device.id)
                        setPage(1)
                        await refreshAfterEnterpriseMutation(`设备 ${device.serialNumber} 已从企业库存删除`)
                        return
                      }

                      const deleted = await window.electronAPI.deleteDevice(device.id)
                      if (!deleted) {
                        setImportMsg(`设备 ${device.serialNumber} 删除失败`)
                        return
                      }
                      setPage(1)
                      await loadDevices(filter === 'all' ? undefined : filter)
                      await syncInventoryState(`设备 ${device.serialNumber} 已删除`)
                    } catch (err: any) {
                      setImportMsg(err?.message || `设备 ${device.serialNumber} 删除失败`)
                    }
                  }}
                >
                  删除
                </button>
              )}
              <span className={`device-card__status device-card__status--${device.status}`}>
                {device.status === 'idle' ? '空闲' : '租用中'}
              </span>
            </div>
          </div>
        ))}
      </div>

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
            onClick={() => setPage(prev => Math.max(1, prev - 1))}
            disabled={safePage === 1}
          >
            ‹ 上一页
          </button>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            第 {safePage} / {totalPages} 页（共 {filteredDevices.length} 台）
          </span>
          <button
            className="settings-panel__btn settings-panel__btn--secondary"
            style={{ fontSize: '12px', height: '28px', padding: '0 12px' }}
            onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
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
    </div>
  )
}
