import { useState, useRef, useCallback, useEffect } from 'react'
import { getAiUsage, incrementAiUsage, isLoggedIn } from '../services/api-client'
import { syncOrdersAfterMutation } from '../services/order-change-sync'

interface OcrFields {
  name: string
  phone: string
  address: string
  deviceId: string
  shipmentDate: string
  rentalStart: string
  rentalEnd: string
  platform: string
  csRep: string
  remarks: string
}

const emptyFields: OcrFields = {
  name: '', phone: '', address: '', deviceId: '', shipmentDate: '',
  rentalStart: '', rentalEnd: '', platform: '', csRep: '', remarks: ''
}

// Default presets — stored in localStorage so users can customize
function loadPresets(key: string, defaults: string[]): string[] {
  try {
    const stored = localStorage.getItem(`preset_${key}`)
    return stored ? JSON.parse(stored) : defaults
  } catch { return defaults }
}

function savePresets(key: string, presets: string[]) {
  localStorage.setItem(`preset_${key}`, JSON.stringify(presets))
}

const DEFAULT_PLATFORMS = ['诚赁', '零零享', '奥祖租', '人人租']
const DEFAULT_DEVICES = ['标准', 'DJI Osmo Pocket 3', 'Pocket 3', 'DJI Osmo Action 5 Pro', 'GoPro Hero 13']
const DEFAULT_CSREPS = ['二号', '星海', '暴龙神', '霸王龙']

export function ScreenshotOrder(): JSX.Element {
  const [image, setImage] = useState<string | null>(null)
  const [recognizing, setRecognizing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fields, setFields] = useState<OcrFields>(emptyFields)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Presets
  const [platformPresets, setPlatformPresets] = useState<string[]>(() => loadPresets('platforms', DEFAULT_PLATFORMS))
  const [devicePresets, setDevicePresets] = useState<string[]>(() => loadPresets('devices', DEFAULT_DEVICES))
  const [csRepPresets, setCsRepPresets] = useState<string[]>(() => loadPresets('csreps', DEFAULT_CSREPS))

  const [newPlatform, setNewPlatform] = useState('')
  const [newDevice, setNewDevice] = useState('')
  const [newCsRep, setNewCsRep] = useState('')
  const [showAddPlatform, setShowAddPlatform] = useState(false)
  const [showAddDevice, setShowAddDevice] = useState(false)
  const [showAddCsRep, setShowAddCsRep] = useState(false)
  const [aiRemaining, setAiRemaining] = useState<number | null>(null)
  const [aiLimit, setAiLimit] = useState<number>(5)
  const [aiPeriodType, setAiPeriodType] = useState<string>('daily')
  const [aiExtraCredits, setAiExtraCredits] = useState<number>(0)

  // Paste handler
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile()
          if (blob) loadImage(blob)
          break
        }
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [])

  // Load AI usage
  useEffect(() => {
    if (isLoggedIn()) {
      getAiUsage().then(u => { setAiRemaining(u.remaining); setAiLimit(u.limit); setAiPeriodType(u.periodType || 'daily'); setAiExtraCredits(u.extraCredits || 0) }).catch(() => {})
    }
  }, [])

  function loadImage(file: File) {
    setError(null)
    setSuccessMsg(null)
    setFields(emptyFields)
    const reader = new FileReader()
    reader.onload = () => setImage(reader.result as string)
    reader.readAsDataURL(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) loadImage(file)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) loadImage(file)
  }

  async function handleRecognize() {
    if (!image) return
    setRecognizing(true)
    setError(null)
    try {
      // Check usage limit
      if (isLoggedIn()) {
        const usage = await getAiUsage()
        setAiRemaining(usage.remaining)
        setAiLimit(usage.limit)
        if (usage.remaining <= 0) {
          setError(`今日 AI 识别次数已用完（${usage.limit}次/天），请升级版本获取更多次数`)
          setRecognizing(false)
          return
        }
      }

      const result = await window.electronAPI.extractOrderFromImage(image)

      // Increment usage after success
      if (isLoggedIn()) {
        incrementAiUsage().then(u => { setAiRemaining(u.remaining); setAiLimit(u.limit); setAiExtraCredits(u.extraCredits || 0) }).catch(() => {})
      }

      // AI result — but override device/platform if they match known presets
      const matchedDevice = fuzzyMatch(result.deviceId, devicePresets)
      const matchedPlatform = fuzzyMatch(result.platform, platformPresets)
      setFields({
        ...result,
        deviceId: matchedDevice || result.deviceId,
        platform: matchedPlatform || result.platform
      })
    } catch (err: any) {
      setError(err.message || '识别失败')
    } finally {
      setRecognizing(false)
    }
  }


  // Smart shipment date calculator
  function calcShipmentDate(address: string, rentalStart: string): { date: string; label: string } | null {
    if (!rentalStart || !address) return null
    const province = extractProvince(address)
    if (!province) return null
    const days = calcShipDays(province)
    const startDate = new Date(rentalStart)
    if (isNaN(startDate.getTime())) return null
    const shipDate = new Date(startDate)
    shipDate.setDate(shipDate.getDate() - days)
    const y = shipDate.getFullYear()
    const m = String(shipDate.getMonth() + 1).padStart(2, '0')
    const d = String(shipDate.getDate()).padStart(2, '0')
    return { date: y + '-' + m + '-' + d, label: '' }
  }

  function extractProvince(address: string): string {
    const provinces = ['北京','天津','上海','重庆','河北','山西','辽宁','吉林','黑龙江','江苏','浙江','安徽','福建','江西','山东','河南','湖北','湖南','广东','广西','海南','四川','贵州','云南','西藏','陕西','甘肃','青海','宁夏','新疆','内蒙古','香港','澳门','台湾']
    for (const p of provinces) { if (address.includes(p)) return p }
    return ''
  }

  function estimateDeliveryDays(province: string): number {
    // 顺丰快递运输天数
    if (province === '新疆') return 5
    // 西藏、青海、甘肃、内蒙古、海南等偏远地区 3天
    if (province === '西藏' || province === '青海' || province === '甘肃' || province === '内蒙古' || province === '海南') return 3
    // 其余地区顺丰 2天到
    return 2
  }
  function provinceLabel(province: string): string {
    const d = calcShipDays(province)
    if (province === '新疆') return '新疆偏远，提前' + d + '天发货'
    return '预计运输' + (d - 1) + '天，提前' + d + '天发货'
  }

  function calcShipDays(province: string): number {
    // 确保起租日前一天送到：运输天数 + 1天缓冲
    return estimateDeliveryDays(province) + 1
  }

  function fuzzyMatch(input: string, presets: string[]): string | null {
    if (!input) return null
    const lower = input.toLowerCase().replace(/\s/g, '')
    for (const p of presets) {
      if (p.toLowerCase().replace(/\s/g, '') === lower) return p
      if (p.includes(input) || input.includes(p)) return p
    }
    return null
  }

  async function handleSave() {
    if (!fields.name || !fields.phone) {
      setError('客户姓名和手机号为必填项')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await window.electronAPI.createFullOrder({
        customerName: fields.name,
        customerPhone: fields.phone,
        customerAddress: fields.address,
        deviceId: fields.deviceId,
        platform: fields.platform,
        csRep: fields.csRep,
        remarks: fields.remarks,
        shipmentDate: fields.shipmentDate,
        rentalStart: fields.rentalStart,
        rentalEnd: fields.rentalEnd
      })
      await syncOrdersAfterMutation()
      setSuccessMsg(`订单已保存：${fields.name} · ${fields.deviceId || '未指定型号'}`)
      setTimeout(() => {
        setImage(null)
        setFields(emptyFields)
        setSuccessMsg(null)
      }, 2000)
    } catch (err: any) {
      setError(err.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  function updateField(key: keyof OcrFields, value: string) {
    setFields(prev => {
      const updated = { ...prev, [key]: value }
      if (key === 'address' || key === 'rentalStart') {
        const calc = calcShipmentDate(
          key === 'address' ? value : prev.address,
          key === 'rentalStart' ? value : prev.rentalStart
        )
        if (calc) updated.shipmentDate = calc.date
      }
      return updated
    })
  }

  function addPreset(type: 'platform' | 'device' | 'csRep') {
    const stateMap = {
      platform: { val: newPlatform, setVal: setNewPlatform, presets: platformPresets, setPresets: setPlatformPresets, key: 'platforms', show: setShowAddPlatform },
      device: { val: newDevice, setVal: setNewDevice, presets: devicePresets, setPresets: setDevicePresets, key: 'devices', show: setShowAddDevice },
      csRep: { val: newCsRep, setVal: setNewCsRep, presets: csRepPresets, setPresets: setCsRepPresets, key: 'csreps', show: setShowAddCsRep }
    }
    const s = stateMap[type]
    const v = s.val.trim()
    if (!v || s.presets.includes(v)) return
    const updated = [...s.presets, v]
    s.setPresets(updated)
    savePresets(s.key, updated)
    if (type === 'platform') updateField('platform', v)
    if (type === 'device') updateField('deviceId', v)
    if (type === 'csRep') updateField('csRep', v)
    s.setVal('')
    s.show(false)
  }

  // ---- Render helpers ----

  function renderSelect(label: string, value: string, presets: string[], onChange: (v: string) => void, showAdd: boolean, setShowAdd: (v: boolean) => void, newVal: string, setNewVal: (v: string) => void, onAdd: () => void, required?: boolean) {
    return (
      <div className="form-group">
        <label className="form-label">
          {label}
          {required && <span style={{ color: '#c62828', marginLeft: '2px' }}>*</span>}
          {value && !recognizing && (
            <span style={{ fontSize: '10px', color: presets.includes(value) ? '#0071e3' : '#2e7d32', marginLeft: '6px', fontWeight: 400 }}>
              {presets.includes(value) ? '预设' : '🤖 AI'}
            </span>
          )}
        </label>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '4px' }}>
          {presets.map(p => (
            <button
              key={p}
              onClick={() => onChange(p)}
              style={{
                padding: '3px 10px', borderRadius: '14px', border: '1px solid',
                borderColor: value === p ? 'var(--accent)' : 'var(--border)',
                background: value === p ? 'var(--accent-light)' : 'transparent',
                color: value === p ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: '11px', cursor: 'pointer', fontWeight: value === p ? 600 : 400,
                transition: 'all 0.15s'
              }}
            >
              {p}
            </button>
          ))}
          {!showAdd ? (
            <button
              onClick={() => setShowAdd(true)}
              style={{
                padding: '3px 10px', borderRadius: '14px', border: '1px dashed var(--border-strong)',
                background: 'transparent', color: 'var(--text-tertiary)', fontSize: '11px', cursor: 'pointer'
              }}
            >
              + 添加
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <input
                className="form-input"
                style={{ width: '100px', height: '24px', fontSize: '11px' }}
                placeholder="新选项"
                value={newVal}
                onChange={e => setNewVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') onAdd() }}
                autoFocus
              />
              <button
                onClick={onAdd}
                style={{
                  padding: '2px 8px', borderRadius: '12px', border: 'none',
                  background: 'var(--accent)', color: '#fff', fontSize: '11px', cursor: 'pointer'
                }}
              >确定</button>
              <button
                onClick={() => setShowAdd(false)}
                style={{
                  padding: '2px 6px', borderRadius: '12px', border: 'none',
                  background: 'transparent', color: 'var(--text-tertiary)', fontSize: '11px', cursor: 'pointer'
                }}
              >✕</button>
            </div>
          )}
        </div>
        <input
          className="form-input"
          style={{ width: '100%' }}
          placeholder="或手动输入"
          value={presets.includes(value) ? '' : value}
          onChange={e => onChange(e.target.value)}
        />
      </div>
    )
  }

  return (
    <div className="screenshot-order" style={{ padding: '0 28px 20px', overflowY: 'auto', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', marginTop: '4px' }}>
        <h3 style={{ fontSize: '17px', fontWeight: 600, margin: 0 }}>📸 截图录单</h3>
        <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '2px' }}>
          <button
            onClick={() => { setManualMode(false); setImage(null); setFields(emptyFields) }}
            style={{
              padding: '5px 14px', borderRadius: '6px', border: 'none', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
              background: !manualMode ? 'var(--bg-secondary)' : 'transparent',
              color: !manualMode ? 'var(--accent)' : 'var(--text-tertiary)',
              boxShadow: !manualMode ? 'var(--shadow-sm)' : 'none'
            }}
          >📸 AI 识别</button>
          <button
            onClick={() => { setManualMode(true); setImage(null); setError(null) }}
            style={{
              padding: '5px 14px', borderRadius: '6px', border: 'none', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
              background: manualMode ? 'var(--bg-secondary)' : 'transparent',
              color: manualMode ? 'var(--accent)' : 'var(--text-tertiary)',
              boxShadow: manualMode ? 'var(--shadow-sm)' : 'none'
            }}
          >✏️ 手动录入</button>
        </div>
      </div>

      {!manualMode && !image ? (
        <div
          className={`screenshot-order__dropzone ${dragOver ? 'screenshot-order__dropzone--active' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="screenshot-order__dropzone-icon">📷</div>
          <div className="screenshot-order__dropzone-title">
            {dragOver ? '松开以添加截图' : '拖拽订单截图到此处，或点击上传'}
          </div>
          <div className="screenshot-order__dropzone-hint">
            支持 Ctrl+V 粘贴剪贴板中的截图 · AI 自动识别 + 人工选择预设值
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileSelect} />
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
            {image && (
              <div style={{ flex: '0 0 320px' }}>
                <img src={image} alt="订单截图" style={{ width: '100%', borderRadius: '12px', border: '1px solid var(--border)' }} />
              </div>
            )}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '10px' }}>
              <div style={{ textAlign: 'center', marginBottom: '8px', fontSize: '14px', color: '#1d1d1f', fontWeight: 600 }}>
                {aiPeriodType === 'monthly' ? '本月' : '今日'}剩余 AI 识别：<strong>{aiRemaining !== null ? aiRemaining : '...'}</strong> / {aiLimit} 次
                {aiExtraCredits > 0 && <span style={{ color: '#2e7d32', marginLeft: '4px' }}>(+{aiExtraCredits} 备用)</span>}
                {aiRemaining === 0 && <span style={{ marginLeft: '4px', color: '#e53935', fontWeight: 700 }}>{aiPeriodType === 'monthly' ? '(次月刷新)' : '(次日刷新)'}</span>}
              </div>
              <button className="settings-panel__btn settings-panel__btn--primary" onClick={handleRecognize} disabled={recognizing || aiRemaining === 0} style={{ width: '100%', height: '42px', fontSize: '14px' }}>
                {recognizing ? '🔍 AI 识别中...' : aiRemaining === 0 ? '🚫 次数已用完' : '🔍 开始识别'}
              </button>
              <button className="settings-panel__btn settings-panel__btn--secondary" onClick={() => { setImage(null); setFields(emptyFields); setError(null) }} style={{ width: '100%', height: '34px', fontSize: '12px' }}>
                更换截图
              </button>
              {error && (
                <div style={{ padding: '8px 12px', background: '#ffebee', borderRadius: '8px', fontSize: '12px', color: '#c62828' }}>{error}</div>
              )}
              {successMsg && (
                <div style={{ padding: '8px 12px', background: '#e8f5e9', borderRadius: '8px', fontSize: '12px', color: '#2e7d32' }}>✅ {successMsg}</div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', background: 'var(--bg-secondary)', borderRadius: '12px', padding: '16px', border: '1px solid var(--border)' }}>
            {/* Name */}
            <div className="form-group">
              <label className="form-label">客户姓名<span style={{ color: '#c62828', marginLeft: '2px' }}>*</span></label>
              <input className="form-input" style={{ width: '100%' }} placeholder="如 张三" value={fields.name} onChange={e => updateField('name', e.target.value)} />
            </div>
            {/* Phone */}
            <div className="form-group">
              <label className="form-label">手机号<span style={{ color: '#c62828', marginLeft: '2px' }}>*</span></label>
              <input className="form-input" style={{ width: '100%' }} placeholder="11位手机号" value={fields.phone} onChange={e => updateField('phone', e.target.value)} />
            </div>
            {/* Address (full width) */}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">收货地址</label>
              <input className="form-input" style={{ width: '100%' }} placeholder="完整地址" value={fields.address} onChange={e => updateField('address', e.target.value)} />
            </div>
            {/* Device (select) */}
            <div style={{ gridColumn: '1 / -1' }}>
              {renderSelect('设备型号', fields.deviceId, devicePresets, v => updateField('deviceId', v), showAddDevice, setShowAddDevice, newDevice, setNewDevice, () => addPreset('device'))}
            </div>
            {/* Dates */}
            <div className="form-group">
              <label className="form-label">发货日</label>
              <input className="form-input" style={{ width: '100%' }} placeholder="YYYY-MM-DD" value={fields.shipmentDate} onChange={e => updateField('shipmentDate', e.target.value)} />
              {fields.address && fields.rentalStart && fields.shipmentDate && (
                <span style={{ fontSize: '10px', color: estimateDeliveryDays(extractProvince(fields.address)) > 3 ? '#e67e22' : '#2e7d32', marginTop: '2px' }}>
                  {'🚚 顺丰 · ' + provinceLabel(extractProvince(fields.address))}
                </span>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">起租日</label>
              <input className="form-input" style={{ width: '100%' }} placeholder="YYYY-MM-DD" value={fields.rentalStart} onChange={e => updateField('rentalStart', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">到期日</label>
              <input className="form-input" style={{ width: '100%' }} placeholder="YYYY-MM-DD" value={fields.rentalEnd} onChange={e => updateField('rentalEnd', e.target.value)} />
            </div>
            {/* Platform (select) */}
            <div>
              {renderSelect('平台', fields.platform, platformPresets, v => updateField('platform', v), showAddPlatform, setShowAddPlatform, newPlatform, setNewPlatform, () => addPreset('platform'))}
            </div>
            {/* CS Rep (select) */}
            <div>
              {renderSelect('客服', fields.csRep, csRepPresets, v => updateField('csRep', v), showAddCsRep, setShowAddCsRep, newCsRep, setNewCsRep, () => addPreset('csRep'))}
            </div>
            {/* Remarks */}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">备注</label>
              <input className="form-input" style={{ width: '100%' }} placeholder="颜色 / 配件要求等" value={fields.remarks} onChange={e => updateField('remarks', e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button className="settings-panel__btn settings-panel__btn--primary" onClick={handleSave} disabled={saving} style={{ height: '38px', padding: '0 24px', fontSize: '14px' }}>
              {saving ? '保存中...' : '✅ 确认保存订单'}
            </button>
          </div>
        </>
      )}

      {/* Manual mode: show form directly, no image needed */}
      {manualMode && !image && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', background: 'var(--bg-secondary)', borderRadius: '12px', padding: '16px', border: '1px solid var(--border)' }}>
          <div className="form-group">
            <label className="form-label">客户姓名<span style={{ color: '#c62828', marginLeft: '2px' }}>*</span></label>
            <input className="form-input" style={{ width: '100%' }} placeholder="如 张三" value={fields.name} onChange={e => updateField('name', e.target.value)} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">手机号<span style={{ color: '#c62828', marginLeft: '2px' }}>*</span></label>
            <input className="form-input" style={{ width: '100%' }} placeholder="11位手机号" value={fields.phone} onChange={e => updateField('phone', e.target.value)} />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">收货地址</label>
            <input className="form-input" style={{ width: '100%' }} placeholder="完整地址" value={fields.address} onChange={e => updateField('address', e.target.value)} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            {renderSelect('设备型号', fields.deviceId, devicePresets, v => updateField('deviceId', v), showAddDevice, setShowAddDevice, newDevice, setNewDevice, () => addPreset('device'))}
          </div>
          <div className="form-group"><label className="form-label">发货日</label><input className="form-input" style={{ width: '100%' }} placeholder="YYYY-MM-DD" value={fields.shipmentDate} onChange={e => updateField('shipmentDate', e.target.value)} />{fields.address && fields.rentalStart && fields.shipmentDate && <span style={{ fontSize: '10px', color: estimateDeliveryDays(extractProvince(fields.address)) > 3 ? '#e67e22' : '#2e7d32', marginTop: '2px' }}>{'🚚 顺丰 · ' + provinceLabel(extractProvince(fields.address))}</span>}</div>
          <div className="form-group"><label className="form-label">起租日</label><input className="form-input" style={{ width: '100%' }} placeholder="YYYY-MM-DD" value={fields.rentalStart} onChange={e => updateField('rentalStart', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">到期日</label><input className="form-input" style={{ width: '100%' }} placeholder="YYYY-MM-DD" value={fields.rentalEnd} onChange={e => updateField('rentalEnd', e.target.value)} /></div>
          <div>{renderSelect('平台', fields.platform, platformPresets, v => updateField('platform', v), showAddPlatform, setShowAddPlatform, newPlatform, setNewPlatform, () => addPreset('platform'))}</div>
          <div>{renderSelect('客服', fields.csRep, csRepPresets, v => updateField('csRep', v), showAddCsRep, setShowAddCsRep, newCsRep, setNewCsRep, () => addPreset('csRep'))}</div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}><label className="form-label">备注</label><input className="form-input" style={{ width: '100%' }} placeholder="颜色 / 配件要求等" value={fields.remarks} onChange={e => updateField('remarks', e.target.value)} /></div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="settings-panel__btn settings-panel__btn--primary" onClick={handleSave} disabled={saving} style={{ height: '38px', padding: '0 24px', fontSize: '14px' }}>
              {saving ? '保存中...' : '✅ 确认保存订单'}
            </button>
          </div>
        </div>
      )}
      {error && !image && manualMode && (
        <div style={{ padding: '8px 12px', background: '#ffebee', borderRadius: '8px', fontSize: '12px', color: '#c62828', marginTop: '8px' }}>{error}</div>
      )}
      {successMsg && !image && manualMode && (
        <div style={{ padding: '8px 12px', background: '#e8f5e9', borderRadius: '8px', fontSize: '12px', color: '#2e7d32', marginTop: '8px' }}>✅ {successMsg}</div>
      )}
    </div>
  )
}
