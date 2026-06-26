import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { networkInterfaces } from 'os'
import * as XLSX from 'xlsx'
import * as deviceStore from './device-store'
import { fetchCustomers, parseCustomerData } from './wps-service'
import { findExpiringCustomers, buildExpiringWithOptions } from './matcher'
import { API_POLYFILL } from './api-polyfill'

const PORT = 3000
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

function getLanIP(): string {
  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address
      }
    }
  }
  return '127.0.0.1'
}

function parseDeviceExcel(buffer: Buffer): { imported: number; errors: string[] } {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return { imported: 0, errors: ['表格中没有工作表'] }

  const sheet = workbook.Sheets[sheetName]
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  if (rows.length < 2) return { imported: 0, errors: ['表格中没有数据'] }

  const headerRow = rows[0].map((h: string) => String(h || '').trim())
  const colMap: Record<string, number> = {}
  const fields: Record<string, string[]> = {
    serialNumber: ['序列号', 'SN', '编号', '机身号', '设备号'],
    deviceId: ['型号', '设备型号', '机型', '类型', '规格']
  }

  for (let i = 0; i < headerRow.length; i++) {
    for (const [field, keys] of Object.entries(fields)) {
      if (keys.some(k => headerRow[i].includes(k))) {
        colMap[field] = i
        break
      }
    }
  }

  if (!('serialNumber' in colMap)) {
    return { imported: 0, errors: ['未找到序列号列，请确保表格包含"序列号"或"SN"列'] }
  }

  const existingDevices = deviceStore.loadDevices()
  const existingSerials = new Set(existingDevices.map(d => d.serialNumber))
  const errors: string[] = []
  let imported = 0

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const sn = String(row[colMap.serialNumber] || '').trim()
    const did = String(row[colMap.deviceId] || '').trim()

    if (!sn) continue
    if (existingSerials.has(sn)) {
      errors.push(`第${i + 1}行: "${sn}" 已存在，跳过`)
      continue
    }

    existingDevices.push({
      id: `dev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      serialNumber: sn,
      deviceId: did || '标准',
      status: 'idle',
      createdAt: new Date().toISOString().slice(0, 10)
    })
    existingSerials.add(sn)
    imported++
  }

  if (imported > 0) {
    deviceStore.saveDevices(existingDevices)
  }

  return { imported, errors }
}

export function startServer(): void {
  const app = express()

  app.use(cors())
  app.use(express.json({ limit: '50mb' }))

  // ---- REST API ----

  // Devices
  app.get('/api/devices', (req, res) => {
    try {
      const status = req.query.status as string | undefined
      res.json(deviceStore.getDevicesByStatus(status as any))
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  app.post('/api/devices', (req, res) => {
    try {
      const { serialNumber, deviceId } = req.body
      if (!serialNumber) return res.status(400).json({ error: '序列号不能为空' })
      res.json(deviceStore.addDevice(serialNumber, deviceId || '标准'))
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // Delete device
  app.delete('/api/devices/:id', (req, res) => {
    try {
      const ok = deviceStore.deleteDevice(req.params.id)
      res.json(ok)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // Device import via file upload (for browser clients)
  app.post('/api/devices/import', upload.single('file'), (req, res) => {
    try {
      if (!req.file) return res.json({ imported: 0, errors: ['请上传 Excel 文件'] })
      const result = parseDeviceExcel(req.file.buffer)
      res.json(result)
    } catch (err: any) {
      res.json({ imported: 0, errors: [`解析失败: ${err.message}`] })
    }
  })

  // Orders
  app.get('/api/orders', (_req, res) => {
    try {
      res.json(deviceStore.loadOrders())
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  app.post('/api/orders', (req, res) => {
    try {
      const { customerName, customerPhone, customerAddress, deviceId } = req.body
      if (!customerName) return res.status(400).json({ error: '客户名不能为空' })
      res.json(deviceStore.createOrder(customerName, customerPhone || '', customerAddress || '', deviceId || '标准'))
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  app.post('/api/orders/dispatch', (req, res) => {
    try {
      const { orderId, serialNumber, trackingNumber } = req.body
      if (!orderId || !serialNumber || !trackingNumber) {
        return res.status(400).json({ error: '缺少必要参数' })
      }
      res.json(deviceStore.dispatchOrder(orderId, serialNumber, trackingNumber))
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  app.post('/api/orders/dispatch-with-new-device', (req, res) => {
    try {
      const { orderId, serialNumber, trackingNumber } = req.body
      if (!orderId || !serialNumber || !trackingNumber) {
        return res.status(400).json({ error: '缺少必要参数' })
      }
      res.json(deviceStore.dispatchOrderWithNewDevice(orderId, serialNumber, trackingNumber))
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  app.post('/api/orders/return', (req, res) => {
    try {
      const { orderId } = req.body
      if (!orderId) return res.status(400).json({ error: '缺少订单ID' })
      res.json(deviceStore.returnOrder(orderId))
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // Renting orders
  app.get('/api/orders/renting', (_req, res) => {
    try { res.json(deviceStore.getRentingOrders()) } catch (err: any) { res.status(500).json({ error: err.message }) }
  })

  // Stats
  app.get('/api/stats/daily', (_req, res) => {
    try { res.json(deviceStore.getDailyStats()) } catch (err: any) { res.status(500).json({ error: err.message }) }
  })

  app.get('/api/stats/inventory', (_req, res) => {
    try { res.json(deviceStore.getInventoryStats()) } catch (err: any) { res.status(500).json({ error: err.message }) }
  })

  // Customer data (same logic as IPC handler)
  app.get('/api/customers/fetch', (_req, res) => {
    try {
      const result = fetchCustomers()
      if (result.error) return res.status(400).json({ error: result.error })

      const expiring = findExpiringCustomers(result.customers)
      const expiringWithOptions = buildExpiringWithOptions(expiring, result.customers)

      const imported = deviceStore.importOrdersFromCustomers(result.customers)
      if (imported > 0) console.log(`[server] Imported ${imported} orders from Excel`)

      res.json({
        expiringCustomers: expiringWithOptions,
        allCustomers: result.customers,
        lastUpdated: new Date().toLocaleString('zh-CN')
      })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })


  // ---- WPS macro sync: receive raw rows from WPS JS macro ----
  app.post('/api/customers/sync', (req, res) => {
    try {
      const { rows } = req.body
      if (!rows || !Array.isArray(rows) || rows.length < 2) {
        return res.status(400).json({ error: '数据格式错误，需要至少包含表头和一行数据' })
      }
      const customers = parseCustomerData(rows)
      const imported = deviceStore.importOrdersFromCustomers(customers)
      console.log(`[wps-sync] Received ${rows.length - 1} rows, parsed ${customers.length} customers, imported ${imported} orders`)
      res.json({ imported, total: customers.length })
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  // ---- Serve React SPA with polyfill injection ----

  const rendererPath = join(__dirname, '../renderer')

  app.use((req, _res, next) => {
    if (req.method === 'GET' && (req.path === '/' || req.path === '/index.html')) {
      const indexPath = join(rendererPath, 'index.html')
      if (existsSync(indexPath)) {
        let html = readFileSync(indexPath, 'utf-8')
        html = html.replace('</head>', API_POLYFILL + '\n</head>')
        _res.type('html').send(html)
        return
      }
    }
    next()
  })


  // ---- Mobile web app ----
  app.get('/mobile', (_req, res) => {
    const mobilePath = join(rendererPath, 'mobile.html')
    if (existsSync(mobilePath)) {
      res.type('html').send(readFileSync(mobilePath, 'utf-8'))
    } else {
      res.status(404).send('Mobile page not found. Run npm run build first.')
    }
  })

  app.use(express.static(rendererPath))

  // SPA fallback — must come after static and API routes
  app.use((_req, res) => {
    const indexPath = join(rendererPath, 'index.html')
    if (existsSync(indexPath)) {
      let html = readFileSync(indexPath, 'utf-8')
      html = html.replace('</head>', API_POLYFILL + '\n</head>')
      res.type('html').send(html)
    } else {
      res.status(404).send('App not built yet. Run npm run build first.')
    }
  })

  // ---- Start ----
  app.listen(PORT, () => {
    const lanIP = getLanIP()
    console.log(`\n========================================`)
    console.log(`  Web 服务器已启动`)
    console.log(`  本地访问:  http://localhost:${PORT}`)
    console.log(`  局域网:    http://${lanIP}:${PORT}`)
    console.log(`========================================\n`)
  })
}
