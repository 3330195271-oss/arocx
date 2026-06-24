import { readFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import * as XLSX from 'xlsx'
import type { Customer } from '../types/customer'
import { getAppDataDir } from './app-data-dir'

interface FetchResult {
  customers: Customer[]
  error?: string
}

let _dataDir: string | null = null
let _dataFile: string | null = null

function getDataDir(): string {
  if (!_dataDir) {
    // In dev: next to project. In production: user's Documents folder
    _dataDir = getAppDataDir()
    if (!existsSync(_dataDir)) mkdirSync(_dataDir, { recursive: true })
  }
  return _dataDir
}

function findLatestXlsx(dir: string): string | null {
  try {
    if (!existsSync(dir)) return null
    const files = readdirSync(dir)
      .filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'))
      .map(f => ({ name: f, time: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time)
    return files.length > 0 ? join(dir, files[0].name) : null
  } catch {
    return null
  }
}

function getDataFile(): string {
  if (!_dataFile) {
    const latest = findLatestXlsx(getDataDir())
    _dataFile = latest || join(getDataDir(), '请放入表格文件.xlsx')
  }
  return _dataFile
}

export function getSavePath(): string {
  return getDataDir()
}

export function openSharedLink(): void {
  // deprecated, keep for compatibility
}

export function fetchCustomers(): FetchResult {
  const dataFile = getDataFile()
  if (!existsSync(dataFile)) {
    const dataDir = getDataDir()
    return {
      customers: [],
      error: `未找到 Excel 表格文件，请将 .xlsx 文件放入:\n${dataDir}\n\n然后点「读取数据」`
    }
  }

  try {
    const buf = readFileSync(dataFile)
    const workbook = XLSX.read(buf, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) return { customers: [], error: '表格中没有工作表' }

    const sheet = workbook.Sheets[sheetName]
    // raw: false — get formatted cell text so "6.2" stays "6.2" instead of becoming number 6.2
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })

    if (rows.length < 2) {
      return { customers: [], error: '表格中没有数据' }
    }

    console.log(`Total rows: ${rows.length}`)
    if (rows.length > 0) {
      console.log('Header:', JSON.stringify(rows[0]))
      console.log('Row 1:', JSON.stringify(rows[1]))
      console.log('Row 2:', JSON.stringify(rows[2] || []))
    }

    const customers = parseCustomerData(rows)
    console.log(`Parsed ${customers.length} customers`)
    if (customers.length > 0) {
      console.log('Sample:', JSON.stringify(customers[0]))
      // Log csRep distribution
      const csCounts: Record<string, number> = {}
      customers.forEach(c => { const k = c.csRep || '(空)'; csCounts[k] = (csCounts[k] || 0) + 1 })
      console.log('CsRep counts:', JSON.stringify(csCounts))
      // Log shipment date distribution
      const sdCounts: Record<string, number> = {}
      customers.forEach(c => { const k = c.shipmentDate || '(空)'; sdCounts[k] = (sdCounts[k] || 0) + 1 })
      console.log('ShipmentDate counts:', JSON.stringify(sdCounts))
      console.log('Today is:', new Date().toISOString().slice(0, 10))
    }
    return { customers }
  } catch (err: any) {
    return { customers: [], error: `读取失败: ${err.message}` }
  }
}

export function parseCustomerData(rows: string[][]): Customer[] {
  if (rows.length < 2) return []
  const header = rows[0].map(h => String(h || '').trim())
  const colMap: Record<string, number> = {}
  const fields: Record<string, string[]> = {
    name: ['姓名', '客户姓名', '名称', '名字', '客户'],
    phone: ['电话', '手机', '联系电话', '手机号', '联系方式'],
    platform: ['平台'],
    csRep: ['客服'],
    remarks: ['备注'],
    address: ['地址', '联系地址', '详细地址'],
    shipmentDate: ['发货日', '发货日期', '发货时间'],
    rentalStart: ['租赁开始', '开始日期', '起租日', '开始时间'],
    rentalEnd: ['租赁结束', '结束日期', '到期日', '结束时间', '归还日期', '最后一天租期', '租期结束', '最后一天'],
    deviceId: ['设备编号', '设备', '物品编号', '器材编号', '设备号', '型号']
  }
  for (let i = 0; i < header.length; i++) {
    for (const [field, keys] of Object.entries(fields)) {
      if (keys.some(k => header[i].includes(k))) { colMap[field] = i; break }
    }
  }
  const allParsed = rows.slice(1).map(row => {
    const rawName = String(row[colMap.name] || '').trim()
    const rawPhone = String(row[colMap.phone] || '').trim()
    const rawAddress = String(row[colMap.address] || '').trim()

    // Extract name and phone from address if missing
    const extracted = extractNamePhone(rawAddress)
    const name = rawName || extracted.name
    const phone = rawPhone || extracted.phone

    // Clean address: remove name, all phone numbers, parenthesized content, leading dashes/spaces
    let address = rawAddress
    if (name) address = address.replace(name, '')
    // Remove all 11-digit phone numbers and any parenthesized numbers
    address = address.replace(/\d{11}/g, '')
    address = address.replace(/[（(]\d+\s*[）)]/g, '')
    address = address.replace(/[（(]\s*[）)]/g, '')
    // Remove leading dashes, spaces, dots
    address = address.replace(/^[-\s.]+/, '').trim()

    return {
      name,
      phone,
      address,
      platform: String(row[colMap.platform] || '').trim(),
      csRep: String(row[colMap.csRep] || '').trim(),
      remarks: String(row[colMap.remarks] || '').trim(),
      shipmentDate: normalizeDate(row[colMap.shipmentDate]),
      rentalStart: normalizeDate(row[colMap.rentalStart]),
      rentalEnd: normalizeDate(row[colMap.rentalEnd]),
      deviceId: String(row[colMap.deviceId] || '').trim()
    }
  })

  // Use fallback name for customers without recognized names
  const result = allParsed.map(c => {
    if (!c.name) {
      // Fallback: use phone, or first meaningful text from address
      const addrStart = c.address.replace(/^[-\s.，,]+/, '').split(/[-\s]/)[0]
      c.name = c.phone || addrStart || '未知客户'
    }
    return c
  })

  const stillNameless = result.filter(c => c.name === '未知客户')
  if (stillNameless.length > 0) {
    console.log(`[parse] ${stillNameless.length} rows using fallback name '未知客户'`)
  }

  return result

function extractNamePhone(addr: string): { name: string; phone: string } {
  // Step 1: Check most common pattern — Chinese name + 11-digit phone right at the start
  // e.g., "周奇13220301743 重庆渝北区..."
  const m1 = addr.match(/^([一-龥]{2,4})(1[3-9]\d{9})/)
  if (m1) {
    return { name: m1[1], phone: m1[2] }
  }

  // Step 2: Find phone number anywhere in the address
  const pm = addr.match(/(1[3-9]\d{9})/)

  // Step 3: Find name — look for 2-4 Chinese chars before the phone, or at address start
  let name = ''
  if (pm) {
    const before = addr.substring(0, pm.index!).trim()
    const nameMatch = before.match(/([一-龥]{2,4})$/)
    if (nameMatch) {
      name = nameMatch[1]
    }
  }
  if (!name) {
    // No phone or no name before phone — grab first 2-4 Chinese chars at start
    const nm = addr.match(/^([一-龥]{2,4})/)
    if (nm) {
      name = nm[1]
    }
  }

  // Step 4: Fallback — any non-digit, non-punctuation text at start
  if (!name) {
    const fb = addr.match(/^([^\s（(，,.\d-]{1,8})/)
    if (fb) {
      name = fb[1].replace(/[（(].*$/, '').trim()
    }
  }

  return { name, phone: pm ? pm[1] : '' }
}
}

function normalizeDate(val: any): string {
  if (val === undefined || val === null) return ''

  // All values come as strings since we use raw:false
  let s = String(val).trim()
  if (!s) return ''

  // M.D format: "6.13", "5.27", "6.5"
  const mdMatch = s.match(/^(\d{1,2})\.(\d{1,2})$/)
  if (mdMatch) {
    const month = parseInt(mdMatch[1])
    const day = parseInt(mdMatch[2])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const year = new Date().getFullYear()
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  // Already YYYY-MM-DD or YYYY-M-D
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const parts = s.split('-')
    return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
  }

  // YYYY/MM/DD
  const slashMatch = s.match(/^(\d{4})[\/](\d{1,2})[\/](\d{1,2})$/)
  if (slashMatch) {
    return `${slashMatch[1]}-${slashMatch[2].padStart(2, '0')}-${slashMatch[3].padStart(2, '0')}`
  }

  // MM/DD/YYYY
  const usMatch = s.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{4})$/)
  if (usMatch) {
    return `${usMatch[3]}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`
  }

  return s
}

export function readExcelFile(filePath: string): FetchResult {
  try {
    const buf = readFileSync(filePath)
    const workbook = XLSX.read(buf, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) return { customers: [], error: '表格中没有工作表' }

    const sheet = workbook.Sheets[sheetName]
    const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })

    if (rows.length < 2) {
      return { customers: [], error: '表格中没有数据' }
    }

    console.log(`[readExcelFile] ${filePath}: ${rows.length} rows`)
    const customers = parseCustomerData(rows)
    console.log(`[readExcelFile] Parsed ${customers.length} customers`)
    return { customers }
  } catch (err: any) {
    return { customers: [], error: `读取失败: ${err.message}` }
  }
}
