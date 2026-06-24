/**
 * OCR Service — 通义千问 VL 视觉识别（DashScope API）
 *
 * 支持：qwen-vl-max（默认，中文OCR最强）/ gpt-4o-mini（API2D备用）
 * API Key 优先级：OCR_API_KEY > DASHSCOPE_API_KEY > OPENAI_API_KEY > data/api-key.txt
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getAppDataDir } from './app-data-dir'

export interface OcrResult {
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

const SYSTEM_PROMPT = `你是一个订单信息提取器。请从截图中提取以下字段，以 JSON 格式返回。
找不到的字段返回空字符串 ""。

{
  "name": "收货人姓名",
  "phone": "手机号（11位）",
  "address": "完整收货地址，逐字提取不遗漏",
  "deviceId": "租赁设备型号",
  "shipmentDate": "发货日期",
  "rentalStart": "起租日期",
  "rentalEnd": "到期日期",
  "platform": "订单平台（如淘宝、诚赁）",
  "csRep": "客服名字",
  "remarks": "备注"
}

只返回JSON，不要其他文字。`

function getDataDir(): string {
  const dir = getAppDataDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function getApiKeyPath(): string {
  return join(getDataDir(), 'api-key.txt')
}

export function getApiKey(): string {
  const envKey = process.env.OCR_API_KEY || process.env.DASHSCOPE_API_KEY || process.env.OPENAI_API_KEY
  if (envKey?.trim()) return envKey.trim()

  const keyPath = getApiKeyPath()
  if (!existsSync(keyPath)) return ''
  return readFileSync(keyPath, 'utf-8').trim()
}

export function getMaskedApiKey(): string {
  const key = getApiKey()
  if (!key) return ''
  if (key.length <= 12) return '已配置'
  return `${key.slice(0, 4)}...${key.slice(-4)}`
}

export function saveApiKey(key: string): void {
  writeFileSync(getApiKeyPath(), key.trim(), { encoding: 'utf-8', mode: 0o600 })
}

export async function extractOrderFromImage(base64Image: string): Promise<OcrResult> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('未配置 OCR API Key，请设置 OCR_API_KEY / OPENAI_API_KEY 或 data/api-key.txt')

  // Detect API provider
  let apiBase: string
  let model: string
  const provider = (process.env.OCR_PROVIDER || '').toLowerCase()

  if (provider === 'dashscope' || apiKey.startsWith('sk-ws-')) {
    // DashScope (通义千问)
    apiBase = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    model = process.env.OCR_MODEL || 'qwen-vl-max'
  } else if (apiKey.startsWith('fk')) {
    // API2D
    apiBase = 'https://oa.api2d.net'
    model = process.env.OCR_MODEL || 'gpt-4o-mini'
  } else {
    // OpenAI official
    apiBase = 'https://api.openai.com'
    model = process.env.OCR_MODEL || 'gpt-4o-mini'
  }

  const imageUrl = base64Image.startsWith('data:image/')
    ? base64Image
    : `data:image/png;base64,${base64Image}`

  const response = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_tokens: 500,
      temperature: 0
    })
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`识别失败 (${response.status}): ${err.slice(0, 300)}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content || ''

  let jsonStr = content.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')

  try {
    const result: OcrResult = JSON.parse(jsonStr)
    return {
      name: clean(result.name),
      phone: clean(result.phone),
      address: clean(result.address),
      deviceId: clean(result.deviceId),
      shipmentDate: normalizeDate(clean(result.shipmentDate)),
      rentalStart: normalizeDate(clean(result.rentalStart)),
      rentalEnd: normalizeDate(clean(result.rentalEnd)),
      platform: clean(result.platform),
      csRep: clean(result.csRep),
      remarks: clean(result.remarks)
    }
  } catch {
    throw new Error(`解析失败，原始输出：${content.slice(0, 200)}`)
  }
}

function clean(s: string): string {
  if (!s || s === '无' || s === '无信息' || s === '未提供') return ''
  return s.trim()
}

function normalizeDate(s: string): string {
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  let m = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日?/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`

  m = s.match(/^(\d{1,2})\.(\d{1,2})$/)
  if (m) {
    const mo = parseInt(m[1]), d = parseInt(m[2])
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${new Date().getFullYear()}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
  }
  return s
}
