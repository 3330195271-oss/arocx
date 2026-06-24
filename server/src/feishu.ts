import { randomUUID } from 'crypto'
import { query } from './db'
import type { AuthUser } from './middleware/auth'

export type FeishuConfig = {
  enabled: boolean
  appId: string
  appSecret: string
  appToken: string
  tableId: string
  primaryFieldName: string
  baseUrl: string
}

type FeishuField = {
  field_id: string
  field_name: string
  type: number
  is_primary: boolean
  property?: Record<string, unknown> | null
}

type FeishuApiEnvelope = {
  code: number
  msg: string
  data?: any
  [key: string]: any
}

type FeishuOrderPayload = {
  id: string
  customerName: string
  customerPhone: string
  customerAddress: string
  platform?: string
  csRep?: string
  remarks?: string
  deviceId: string
  serialNumber?: string
  trackingNumber?: string
  shipmentDate?: string
  rentalStart?: string
  rentalEnd?: string
  dispatchDate?: string
  returnDate?: string
  status: string
  forwardedFromOrderId?: string
  forwardedToOrderId?: string
  forwardTracking?: string
  feishuRecordId?: string
}

export type FeishuSyncMeta = {
  feishuRecordId: string
  feishuSyncStatus: 'synced' | 'failed'
  feishuSyncError: string
  feishuSyncedAt: string
}

type FeishuConfigStore = {
  resolve: () => Promise<FeishuConfig>
  save: (patch: Partial<FeishuConfig>) => Promise<FeishuConfig>
  baseName: string
}

const PRIMARY_FIELD_NAME = '订单标题'
const DEFAULT_BASE_NAME = '仓库订单同步'
const DEFAULT_ORDER_FIELDS = [
  '订单ID',
  '客户姓名',
  '客户电话',
  '客户地址',
  '平台',
  '客服',
  '备注',
  '设备型号',
  '设备序列号',
  '快递单号',
  '发货日',
  '起租日',
  '到期日',
  '发货时间',
  '归还日',
  '订单状态',
  '转寄来源订单',
  '转寄目标订单',
  '转寄快递单号',
  '创建账号',
  '飞书同步时间'
] as const

const FEISHU_SETTING_KEYS = {
  enabled: 'feishu_enabled',
  appId: 'feishu_app_id',
  appSecret: 'feishu_app_secret',
  appToken: 'feishu_app_token',
  tableId: 'feishu_table_id',
  primaryFieldName: 'feishu_primary_field_name',
  baseUrl: 'feishu_base_url'
} as const

const FEISHU_ENV_KEYS = {
  enabled: 'FEISHU_ENABLED',
  appId: 'FEISHU_APP_ID',
  appSecret: 'FEISHU_APP_SECRET',
  appToken: 'FEISHU_APP_TOKEN',
  tableId: 'FEISHU_TABLE_ID',
  primaryFieldName: 'FEISHU_PRIMARY_FIELD_NAME',
  baseUrl: 'FEISHU_BASE_URL'
} as const

let tokenCache: { cacheKey: string; token: string; expiresAt: number } | null = null

function parseBool(value?: string | null): boolean {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function normalizeText(value?: string | null): string {
  return String(value || '').trim()
}

function nowIso(): string {
  return new Date().toISOString()
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isRetryableFeishuError(message: string): boolean {
  return [
    '1254291',
    '1254290',
    '1254607',
    '1254036',
    'Write conflict',
    '请求超时',
    'Data not ready'
  ].some(keyword => message.includes(keyword))
}

function buildFeishuConfig(source: Partial<FeishuConfig>, fallback: Partial<FeishuConfig> = {}): FeishuConfig {
  const appToken = normalizeText(source.appToken ?? fallback.appToken ?? '')
  const primaryFieldName = normalizeText(source.primaryFieldName ?? fallback.primaryFieldName ?? PRIMARY_FIELD_NAME) || PRIMARY_FIELD_NAME
  const baseUrl = normalizeText(
    source.baseUrl ??
    fallback.baseUrl ??
    (appToken ? `https://www.feishu.cn/base/${appToken}` : '')
  )

  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : Boolean(fallback.enabled),
    appId: normalizeText(source.appId ?? fallback.appId ?? ''),
    appSecret: normalizeText(source.appSecret ?? fallback.appSecret ?? ''),
    appToken,
    tableId: normalizeText(source.tableId ?? fallback.tableId ?? ''),
    primaryFieldName,
    baseUrl
  }
}

async function withFeishuRetry<T>(task: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: Error | null = null
  for (let index = 0; index < attempts; index++) {
    try {
      return await task()
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (index === attempts - 1 || !isRetryableFeishuError(lastError.message)) {
        throw lastError
      }
      await sleep(600 * (index + 1))
    }
  }
  throw lastError || new Error('飞书请求失败')
}

async function getStoredFeishuConfig(): Promise<Partial<FeishuConfig>> {
  const result = await query(
    'SELECT key, value FROM app_settings WHERE key = ANY($1::varchar[])',
    [Object.values(FEISHU_SETTING_KEYS)]
  )

  const values = new Map<string, string>(result.rows.map(row => [row.key, row.value]))

  return {
    ...(values.has(FEISHU_SETTING_KEYS.enabled) ? { enabled: parseBool(values.get(FEISHU_SETTING_KEYS.enabled)) } : {}),
    ...(values.has(FEISHU_SETTING_KEYS.appId) ? { appId: values.get(FEISHU_SETTING_KEYS.appId) || '' } : {}),
    ...(values.has(FEISHU_SETTING_KEYS.appSecret) ? { appSecret: values.get(FEISHU_SETTING_KEYS.appSecret) || '' } : {}),
    ...(values.has(FEISHU_SETTING_KEYS.appToken) ? { appToken: values.get(FEISHU_SETTING_KEYS.appToken) || '' } : {}),
    ...(values.has(FEISHU_SETTING_KEYS.tableId) ? { tableId: values.get(FEISHU_SETTING_KEYS.tableId) || '' } : {}),
    ...(values.has(FEISHU_SETTING_KEYS.primaryFieldName) ? { primaryFieldName: values.get(FEISHU_SETTING_KEYS.primaryFieldName) || '' } : {}),
    ...(values.has(FEISHU_SETTING_KEYS.baseUrl) ? { baseUrl: values.get(FEISHU_SETTING_KEYS.baseUrl) || '' } : {})
  }
}

function getEnvFeishuConfig(): Partial<FeishuConfig> {
  return {
    enabled: parseBool(process.env[FEISHU_ENV_KEYS.enabled]),
    appId: process.env[FEISHU_ENV_KEYS.appId] || '',
    appSecret: process.env[FEISHU_ENV_KEYS.appSecret] || '',
    appToken: process.env[FEISHU_ENV_KEYS.appToken] || '',
    tableId: process.env[FEISHU_ENV_KEYS.tableId] || '',
    primaryFieldName: process.env[FEISHU_ENV_KEYS.primaryFieldName] || PRIMARY_FIELD_NAME,
    baseUrl: process.env[FEISHU_ENV_KEYS.baseUrl] || ''
  }
}

async function getStoredUserFeishuConfig(userId: number): Promise<Partial<FeishuConfig>> {
  const result = await query(
    `SELECT enabled, app_id, app_secret, app_token, table_id, primary_field_name, base_url
     FROM user_feishu_settings
     WHERE user_id = $1`,
    [userId]
  )

  if (result.rows.length === 0) {
    return {}
  }

  const row = result.rows[0]
  return {
    enabled: Boolean(row.enabled),
    appId: row.app_id || '',
    appSecret: row.app_secret || '',
    appToken: row.app_token || '',
    tableId: row.table_id || '',
    primaryFieldName: row.primary_field_name || PRIMARY_FIELD_NAME,
    baseUrl: row.base_url || ''
  }
}

export async function resolveFeishuConfig(): Promise<FeishuConfig> {
  const stored = await getStoredFeishuConfig()
  return buildFeishuConfig(stored, getEnvFeishuConfig())
}

export async function resolveUserFeishuConfig(userId: number): Promise<FeishuConfig> {
  const stored = await getStoredUserFeishuConfig(userId)
  return buildFeishuConfig(stored, {
    enabled: false,
    primaryFieldName: PRIMARY_FIELD_NAME
  })
}

export async function saveFeishuConfig(patch: Partial<FeishuConfig>): Promise<FeishuConfig> {
  const current = await resolveFeishuConfig()
  const next = buildFeishuConfig({ ...current, ...patch })

  const entries: Array<[string, string]> = [
    [FEISHU_SETTING_KEYS.enabled, next.enabled ? 'true' : 'false'],
    [FEISHU_SETTING_KEYS.appId, next.appId],
    [FEISHU_SETTING_KEYS.appSecret, next.appSecret],
    [FEISHU_SETTING_KEYS.appToken, next.appToken],
    [FEISHU_SETTING_KEYS.tableId, next.tableId],
    [FEISHU_SETTING_KEYS.primaryFieldName, next.primaryFieldName],
    [FEISHU_SETTING_KEYS.baseUrl, next.baseUrl]
  ]

  for (const [key, value] of entries) {
    await query(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, value]
    )
  }

  return next
}

export async function saveUserFeishuConfig(userId: number, patch: Partial<FeishuConfig>): Promise<FeishuConfig> {
  const current = await resolveUserFeishuConfig(userId)
  const next = buildFeishuConfig({ ...current, ...patch })

  await query(
    `INSERT INTO user_feishu_settings (
      user_id, enabled, app_id, app_secret, app_token, table_id, primary_field_name, base_url, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      enabled = EXCLUDED.enabled,
      app_id = EXCLUDED.app_id,
      app_secret = EXCLUDED.app_secret,
      app_token = EXCLUDED.app_token,
      table_id = EXCLUDED.table_id,
      primary_field_name = EXCLUDED.primary_field_name,
      base_url = EXCLUDED.base_url,
      updated_at = NOW()`,
    [
      userId,
      next.enabled,
      next.appId,
      next.appSecret,
      next.appToken,
      next.tableId,
      next.primaryFieldName,
      next.baseUrl
    ]
  )

  return next
}

async function getTenantAccessToken(config: FeishuConfig): Promise<string> {
  if (!config.appId || !config.appSecret) {
    throw new Error('飞书 App ID 或 App Secret 未配置')
  }

  const cacheKey = `${config.appId}:${config.appSecret}`
  if (tokenCache && tokenCache.cacheKey === cacheKey && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token
  }

  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      app_id: config.appId,
      app_secret: config.appSecret
    })
  })
  const data = await response.json() as FeishuApiEnvelope
  if (!response.ok || data.code !== 0 || !data.tenant_access_token) {
    throw new Error(data.msg || '获取飞书 tenant_access_token 失败')
  }

  tokenCache = {
    cacheKey,
    token: data.tenant_access_token,
    expiresAt: Date.now() + Math.max(0, Number(data.expire || 7200) - 300) * 1000
  }

  return tokenCache.token
}

async function feishuRequest<T>(config: FeishuConfig, path: string, init: RequestInit = {}): Promise<T> {
  const token = await getTenantAccessToken(config)
  const response = await fetch(`https://open.feishu.cn${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
      ...(init.headers || {})
    }
  })

  const data = await response.json() as FeishuApiEnvelope
  if (!response.ok || data.code !== 0) {
    throw new Error(`${data.msg || '飞书接口调用失败'}${data.code ? ` (${data.code})` : ''}`)
  }
  return data as T
}

async function listFields(config: FeishuConfig): Promise<FeishuField[]> {
  if (!config.appToken || !config.tableId) {
    throw new Error('飞书 App Token 或 Table ID 未配置')
  }

  const response = await feishuRequest<{ data: { items: FeishuField[] } }>(
    config,
    `/open-apis/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/fields?page_size=100`
  )
  return response.data.items || []
}

async function updateField(config: FeishuConfig, field: FeishuField, fieldName: string): Promise<void> {
  if (!config.appToken || !config.tableId) throw new Error('飞书表格未配置')
  await withFeishuRetry(async () => {
    await feishuRequest(
      config,
      `/open-apis/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/fields/${field.field_id}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          field_name: fieldName,
          type: field.type,
          ...(field.property ? { property: field.property } : {})
        })
      }
    )
  })
  await sleep(180)
}

async function createTextField(config: FeishuConfig, fieldName: string): Promise<void> {
  if (!config.appToken || !config.tableId) throw new Error('飞书表格未配置')
  await withFeishuRetry(async () => {
    await feishuRequest(
      config,
      `/open-apis/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/fields?client_token=${randomUUID()}`,
      {
        method: 'POST',
        body: JSON.stringify({
          field_name: fieldName,
          type: 1
        })
      }
    )
  })
  await sleep(180)
}

async function ensureOrderTableStructure(config: FeishuConfig, saveConfig: FeishuConfigStore['save']): Promise<FeishuConfig> {
  let fields = await withFeishuRetry(() => listFields(config))
  const primary = fields.find(field => field.is_primary)

  let nextConfig = config
  if (primary && primary.field_name !== PRIMARY_FIELD_NAME) {
    await updateField(config, primary, PRIMARY_FIELD_NAME)
    nextConfig = await saveConfig({ primaryFieldName: PRIMARY_FIELD_NAME })
    fields = await listFields(nextConfig)
  } else if (!config.primaryFieldName) {
    nextConfig = await saveConfig({ primaryFieldName: primary?.field_name || PRIMARY_FIELD_NAME })
    fields = await listFields(nextConfig)
  }

  const existing = new Set(fields.map(field => field.field_name))
  for (const fieldName of DEFAULT_ORDER_FIELDS) {
    if (existing.has(fieldName)) continue
    await createTextField(nextConfig, fieldName)
  }

  return nextConfig
}

async function bootstrapFeishuOrderTableWith(store: FeishuConfigStore): Promise<FeishuConfig> {
  let config = await store.resolve()
  if (!config.appId || !config.appSecret) {
    throw new Error('请先配置飞书 App ID 和 App Secret')
  }

  if (!config.appToken || !config.tableId) {
    const created = await withFeishuRetry(async () => {
      return feishuRequest<{ data: { app: { app_token: string; default_table_id: string; url: string } } }>(
        config,
        '/open-apis/bitable/v1/apps',
        {
          method: 'POST',
          body: JSON.stringify({
            name: store.baseName,
            time_zone: 'Asia/Shanghai'
          })
        }
      )
    })

    config = await store.save({
      appToken: created.data.app.app_token,
      tableId: created.data.app.default_table_id,
      primaryFieldName: PRIMARY_FIELD_NAME,
      baseUrl: created.data.app.url || `https://www.feishu.cn/base/${created.data.app.app_token}`,
      enabled: true
    })

    await sleep(1000)
  }

  config = await ensureOrderTableStructure(config, store.save)
  return config
}

function buildUserBaseName(user: Pick<AuthUser, 'userId' | 'email'>): string {
  const label = normalizeText(user.email).split('@')[0] || `user-${user.userId}`
  return `${label}订单同步`
}

export async function bootstrapFeishuOrderTable(): Promise<FeishuConfig> {
  return bootstrapFeishuOrderTableWith({
    resolve: resolveFeishuConfig,
    save: saveFeishuConfig,
    baseName: DEFAULT_BASE_NAME
  })
}

export async function bootstrapUserFeishuOrderTable(user: Pick<AuthUser, 'userId' | 'email'>): Promise<FeishuConfig> {
  return bootstrapFeishuOrderTableWith({
    resolve: () => resolveUserFeishuConfig(user.userId),
    save: (patch) => saveUserFeishuConfig(user.userId, patch),
    baseName: buildUserBaseName(user)
  })
}

function orderStatusLabel(status: string): string {
  if (status === 'dispatched') return '已发货'
  if (status === 'returned') return '已归还'
  return '待发货'
}

function buildOrderTitle(order: FeishuOrderPayload): string {
  const name = normalizeText(order.customerName || '未命名客户')
  const device = normalizeText(order.deviceId || '未指定设备')
  return `${name} · ${device}`
}

function buildOrderFields(config: FeishuConfig, order: FeishuOrderPayload, user: AuthUser): Record<string, string> {
  const syncTime = nowIso()
  return {
    [config.primaryFieldName || PRIMARY_FIELD_NAME]: buildOrderTitle(order),
    订单ID: order.id,
    客户姓名: normalizeText(order.customerName),
    客户电话: normalizeText(order.customerPhone),
    客户地址: normalizeText(order.customerAddress),
    平台: normalizeText(order.platform),
    客服: normalizeText(order.csRep),
    备注: normalizeText(order.remarks),
    设备型号: normalizeText(order.deviceId),
    设备序列号: normalizeText(order.serialNumber),
    快递单号: normalizeText(order.trackingNumber),
    发货日: normalizeText(order.shipmentDate),
    起租日: normalizeText(order.rentalStart),
    到期日: normalizeText(order.rentalEnd),
    发货时间: normalizeText(order.dispatchDate),
    归还日: normalizeText(order.returnDate),
    订单状态: orderStatusLabel(order.status),
    转寄来源订单: normalizeText(order.forwardedFromOrderId),
    转寄目标订单: normalizeText(order.forwardedToOrderId),
    转寄快递单号: normalizeText(order.forwardTracking),
    创建账号: normalizeText(user.email),
    飞书同步时间: syncTime
  }
}

export async function syncOrderToFeishu(order: FeishuOrderPayload, user: AuthUser): Promise<FeishuSyncMeta | null> {
  let config = await resolveUserFeishuConfig(user.userId)
  if (!config.enabled) return null
  if (!config.appId || !config.appSecret || !config.appToken || !config.tableId) {
    return {
      feishuRecordId: normalizeText(order.feishuRecordId),
      feishuSyncStatus: 'failed',
      feishuSyncError: '飞书同步尚未完成配置',
      feishuSyncedAt: ''
    }
  }

  if (!config.primaryFieldName) {
    config = await saveUserFeishuConfig(user.userId, { primaryFieldName: PRIMARY_FIELD_NAME })
  }

  const fields = buildOrderFields(config, order, user)

  try {
    if (order.feishuRecordId) {
      await withFeishuRetry(async () => {
        await feishuRequest(
          config,
          `/open-apis/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/records/${order.feishuRecordId}`,
          {
            method: 'PUT',
            body: JSON.stringify({ fields })
          }
        )
      })

      return {
        feishuRecordId: order.feishuRecordId,
        feishuSyncStatus: 'synced',
        feishuSyncError: '',
        feishuSyncedAt: nowIso()
      }
    }

    const created = await withFeishuRetry(async () => {
      return feishuRequest<{ data: { record: { record_id: string } } }>(
        config,
        `/open-apis/bitable/v1/apps/${config.appToken}/tables/${config.tableId}/records?client_token=${randomUUID()}`,
        {
          method: 'POST',
          body: JSON.stringify({ fields })
        }
      )
    })

    return {
      feishuRecordId: created.data.record.record_id,
      feishuSyncStatus: 'synced',
      feishuSyncError: '',
      feishuSyncedAt: nowIso()
    }
  } catch (error: any) {
    return {
      feishuRecordId: normalizeText(order.feishuRecordId),
      feishuSyncStatus: 'failed',
      feishuSyncError: error?.message || '飞书同步失败',
      feishuSyncedAt: normalizeText((order as any).feishuSyncedAt)
    }
  }
}
