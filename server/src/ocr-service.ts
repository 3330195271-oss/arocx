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

function clean(value: string): string {
  if (!value || value === '无' || value === '无信息' || value === '未提供') return ''
  return value.trim()
}

function normalizeDate(value: string): string {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value

  let match = value.match(/(\d{4})年(\d{1,2})月(\d{1,2})日?/)
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`

  match = value.match(/^(\d{1,2})\.(\d{1,2})$/)
  if (match) {
    const month = parseInt(match[1], 10)
    const day = parseInt(match[2], 10)
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${new Date().getFullYear()}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  return value
}

function resolveOcrRuntime(apiKey: string): { apiBase: string; model: string } {
  const provider = (process.env.OCR_PROVIDER || '').toLowerCase()

  if (provider === 'dashscope' || apiKey.startsWith('sk-ws-')) {
    return {
      apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: process.env.OCR_MODEL || 'qwen-vl-max'
    }
  }

  if (apiKey.startsWith('fk')) {
    return {
      apiBase: 'https://oa.api2d.net',
      model: process.env.OCR_MODEL || 'gpt-4o-mini'
    }
  }

  return {
    apiBase: 'https://api.openai.com',
    model: process.env.OCR_MODEL || 'gpt-4o-mini'
  }
}

export async function extractOrderFromImageWithKey(apiKey: string, base64Image: string): Promise<OcrResult> {
  const { apiBase, model } = resolveOcrRuntime(apiKey.trim())
  const imageUrl = base64Image.startsWith('data:image/')
    ? base64Image
    : `data:image/png;base64,${base64Image}`

  const response = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey.trim()}`
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
    const errText = await response.text()
    throw new Error(`识别失败 (${response.status}): ${errText.slice(0, 300)}`)
  }

  const data: any = await response.json()
  const content = data.choices?.[0]?.message?.content || ''
  const jsonStr = content.trim()
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
