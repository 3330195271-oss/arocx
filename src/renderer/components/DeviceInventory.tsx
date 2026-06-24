import { useEffect, useState, useMemo } from 'react'
import type { Device } from '../types/customer'
import { isLoggedIn } from '../services/api-client'
import { syncNow, buildElectronSyncOptions } from '../services/sync-service'
import type { HomeInventoryFilter } from '../types/home-navigation'

const PAGE_SIZE = 10

interface DeviceInventoryProps {
  initialFilter?: HomeInventoryFilter
}

export function DeviceInventory({ initialFilter = 'all' }: DeviceInventoryProps): JSX.Element {
  const [devices, setDevices] = useState<Device[]>([])
  const [filter, setFilter] = useState<HomeInventoryFilter>(initialFilter)
  const [serial, setSerial] = useState('')
  const [model, setModel] = useState('')
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [modelSearch, setModelSearch] = useState('')

  useEffect(() => {
    setFilter(initialFilter)
    loadDevices(initialFilter === 'all' ? undefined : initialFilter)
  }, [initialFilter])

  function loadDevices(status?: string) {
    window.electronAPI.getDevices(status).then(setDevices)
  }

  function handleFilter(s: HomeInventoryFilter) {
    setFilter(s)
    setPage(1)
    loadDevices(s === 'all' ? undefined : s)
  }

  async function syncInventoryState(successMessage: string) {
    if (!isLoggedIn()) {
      setImportMsg(`${successMessage}，当前未登录，未同步到云端`)
      return
    }

    try {
      await syncNow(buildElectronSyncOptions(() => {
        loadDevices(filter === 'all' ? undefined : filter)
      }))
      setImportMsg(`成功：${successMessage}，已同步到云端`)
    } catch (err: any) {
      setImportMsg(`${successMessage}，但同步到云端失败：${err?.message || '未知错误'}`)
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
      loadDevices(filter === 'all' ? undefined : filter)
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
        loadDevices(filter === 'all' ? undefined : filter)
        if (isLoggedIn()) {
          try {
            await syncNow(buildElectronSyncOptions(() => {
              loadDevices(filter === 'all' ? undefined : filter)
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

  const idle = devices.filter(d => d.status === 'idle').length
  const renting = devices.filter(d => d.status === 'renting').length

  // Model counts
  const modelCounts = useMemo(() => {
    const m: Record<string, number> = {}
    devices.forEach(d => { m[d.deviceId] = (m[d.deviceId] || 0) + 1 })
    return m
  }, [devices])

  // Client-side model filter
  const filteredDevices = useMemo(() => {
    if (!modelSearch.trim()) return devices
    const q = modelSearch.trim().toLowerCase()
    return devices.filter(d => d.deviceId.toLowerCase().includes(q))
  }, [devices, modelSearch])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredDevices.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)

  const pagedDevices = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return filteredDevices.slice(start, start + PAGE_SIZE)
  }, [filteredDevices, safePage])

  const inventoryFilters: Array<{ k: HomeInventoryFilter; l: string }> = [
    { k: 'all', l: '全部' },
    { k: 'idle', l: '空闲' },
    { k: 'renting', l: '租用中' }
  ]

  return (
    <div className="device-inventory" style={{ padding: '0 28px 20px', overflowY: 'auto', flex: 1 }}>
      {/* Summary */}
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
            {Object.entries(modelCounts).sort((a,b) => b[1]-a[1]).slice(0, 5).map(([m, c]) => `${m}:${c}`).join(' · ')}
          </span>
        )}
      </div>

      {/* Add form + Import button */}
      <div className="device-form" style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
        <input
          className="form-input"
          style={{ flex: 1 }}
          placeholder="序列号"
          value={serial}
          onChange={e => setSerial(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <input
          className="form-input"
          style={{ width: '120px' }}
          placeholder="型号"
          value={model}
          onChange={e => setModel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <button className="settings-panel__btn settings-panel__btn--primary" onClick={handleAdd} disabled={adding}>
          {adding ? '...' : '入库'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          className="settings-panel__btn settings-panel__btn--secondary"
          onClick={handleImport}
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

      {/* Filters + Model search */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'center' }}>
        <div className="filter-bar--segmented" style={{ marginBottom: '0' }}>
          {inventoryFilters.map(f => (
            <button
              key={f.k}
              className={`filter-btn ${filter === f.k ? 'filter-btn--active' : ''}`}
              onClick={() => handleFilter(f.k)}
            >
              {f.l}
            </button>
          ))}
        </div>
        <input
          className="form-input"
          style={{ width: '150px', height: '28px', fontSize: '12px' }}
          placeholder="搜索型号..."
          value={modelSearch}
          onChange={e => { setModelSearch(e.target.value); setPage(1) }}
        />
      </div>

      {/* Device list */}
      <div className="device-list">
        {devices.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)', fontSize: '13px' }}>
            暂无设备，请手动入库或从表格导入
          </div>
        )}
        {pagedDevices.map(d => (
          <div key={d.id} className="device-card">
            <div className="device-card__info">
              <div className="device-card__serial">{d.serialNumber}</div>
              <div className="device-card__meta">
                型号：{d.deviceId} · 入库 {d.createdAt}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {d.status === 'idle' && (
                <button
                  className="settings-panel__btn settings-panel__btn--secondary"
                  style={{ fontSize: '11px', height: '26px', padding: '0 8px', color: '#c62828', borderColor: '#ffcdd2' }}
                  onClick={async () => {
                    if (confirm(`确定要删除设备 ${d.serialNumber} 吗？`)) {
                      setImportMsg(null)
                      const deleted = await window.electronAPI.deleteDevice(d.id)
                      if (!deleted) {
                        setImportMsg(`设备 ${d.serialNumber} 删除失败`)
                        return
                      }
                      setPage(1)
                      loadDevices(filter === 'all' ? undefined : filter)
                      await syncInventoryState(`设备 ${d.serialNumber} 已删除`)
                    }
                  }}
                >
                  删除
                </button>
              )}
              <span className={`device-card__status device-card__status--${d.status}`}>
                {d.status === 'idle' ? '空闲' : '租用中'}
              </span>
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
            第 {safePage} / {totalPages} 页（共 {filteredDevices.length} 台）
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
    </div>
  )
}
