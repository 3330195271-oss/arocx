/**
 * API Client for cloud server communication
 */

const DEFAULT_API_BASE = 'https://arocx.fun'

function normalizeApiBase(url: string): string {
  const normalized = url.trim().replace(/\/+$/, '')
  return normalized || DEFAULT_API_BASE
}

function getApiBase(): string {
  return normalizeApiBase(localStorage.getItem('server_url') || DEFAULT_API_BASE)
}

interface AuthUser {
  userId: number
  email: string
  tier: string
}

type ClientDeviceIdentity = {
  deviceId: string
  deviceName: string
}

let _token: string | null = localStorage.getItem('auth_token')
let _user: AuthUser | null = null
let _deviceIdentityPromise: Promise<ClientDeviceIdentity | null> | null = null

try {
  const stored = localStorage.getItem('auth_user')
  if (stored) _user = JSON.parse(stored)
} catch {}

export function getToken(): string | null { return _token }
export function getUser(): AuthUser | null { return _user }
export function isLoggedIn(): boolean { return !!_token && !!_user }

function setAuth(token: string, user: AuthUser) {
  _token = token
  _user = user
  localStorage.setItem('auth_token', token)
  localStorage.setItem('auth_user', JSON.stringify(user))
}

export function getApiBaseUrl(): string { return getApiBase() }
export function setApiBaseUrl(url: string) {
  localStorage.setItem('server_url', normalizeApiBase(url))
}

export function logout() {
  _token = null
  _user = null
  localStorage.removeItem('auth_token')
  localStorage.removeItem('auth_user')
}

async function getClientDeviceIdentity(): Promise<ClientDeviceIdentity | null> {
  if (typeof window === 'undefined' || !window.electronAPI?.getClientDeviceIdentity) return null
  if (!_deviceIdentityPromise) {
    _deviceIdentityPromise = window.electronAPI.getClientDeviceIdentity().catch(() => null)
  }
  return _deviceIdentityPromise
}

function emitSessionInvalid(message: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('auth-session-invalid', { detail: message }))
}

async function request(path: string, options: RequestInit = {}): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  }
  const deviceIdentity = await getClientDeviceIdentity()
  if (deviceIdentity?.deviceId) {
    headers['X-Client-Device-Id'] = deviceIdentity.deviceId
  }
  if (deviceIdentity?.deviceName) {
    headers['X-Client-Device-Name'] = deviceIdentity.deviceName
  }
  if (_token) {
    headers['Authorization'] = `Bearer ${_token}`
  }

  let resp: Response
  try {
    resp = await fetch(`${getApiBase()}${path}`, { ...options, headers })
  } catch {
    throw new Error(`无法连接云服务器：${getApiBase()}`)
  }

  const text = await resp.text()
  let data: any = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { error: text }
    }
  }

  if (!resp.ok) {
    const message = data?.error || data?.message || `请求失败 (${resp.status})`
    if (resp.status === 401 && _token && !path.startsWith('/api/auth/login') && !path.startsWith('/api/auth/register')) {
      logout()
      emitSessionInvalid(message)
    }
    throw new Error(message)
  }

  return data
}

// ---- Auth ----

export async function login(email: string, password: string) {
  const data = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  })
  setAuth(data.token, data.user)
  return data.user as AuthUser
}

export async function register(email: string, password: string, verifyCode?: string) {
  const data = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, verifyCode })
  })
  setAuth(data.token, data.user)
  return data.user as AuthUser
}

export async function sendVerifyCode(email: string): Promise<{ success: boolean; message: string }> {
  return request('/api/verify/send-code', {
    method: 'POST',
    body: JSON.stringify({ email })
  })
}

export async function verifyToken(): Promise<AuthUser | null> {
  if (!_token) return null
  try {
    const data = await request('/api/auth/me')
    _user = data.user
    localStorage.setItem('auth_user', JSON.stringify(_user))
    return _user
  } catch {
    // Server unreachable — use cached user data
    if (_user) {
      console.log('[auth] Server unreachable, using cached session')
      return _user
    }
    logout()
    return null
  }
}

// ---- Sync ----

export async function pullOrders(): Promise<any[]> {
  return request('/api/sync/orders')
}

export async function pushOrders(orders: any[]): Promise<{ upserted: number }> {
  return request('/api/sync/orders', {
    method: 'POST',
    body: JSON.stringify({ orders })
  })
}

export async function pullDevices(): Promise<any[]> {
  return request('/api/sync/devices')
}

export async function pushDevices(devices: any[]): Promise<{ upserted: number }> {
  return request('/api/sync/devices', {
    method: 'POST',
    body: JSON.stringify({ devices })
  })
}

export async function pullEnterpriseWorkspaceOrders(): Promise<any[]> {
  return request('/api/enterprise/sync/orders')
}

export async function pushEnterpriseWorkspaceOrders(orders: any[]): Promise<{ upserted: number; deleted: number }> {
  return request('/api/enterprise/sync/orders', {
    method: 'POST',
    body: JSON.stringify({ orders })
  })
}

export async function pullEnterpriseWorkspaceDevices(): Promise<any[]> {
  return request('/api/enterprise/sync/devices')
}

export async function pushEnterpriseWorkspaceDevices(devices: any[]): Promise<{ upserted: number; deleted: number }> {
  return request('/api/enterprise/sync/devices', {
    method: 'POST',
    body: JSON.stringify({ devices })
  })
}

// ---- Subscription ----

export interface TierInfo {
  name: string
  features: string[]
  price: string
}

export interface SubscriptionInfo {
  tier: string
  tierName: string
  features: string[]
  price: string
  subscriptionExpires: string | null
  createdAt: string | null
}

export interface AppVersionInfo {
  currentVersion: string
  latestVersion: string
  minimumVersion: string
  downloadUrl: string
  downloadUrlWindows: string
  downloadUrlMacArm64: string
  downloadUrlMacX64: string
  releaseNotes: string
  publishedAt: string | null
  hasUpdate: boolean
  forceUpdate: boolean
}

export interface ClientPlatformInfo {
  platform: string
  arch: string
}

export interface AdminAppVersionPayload {
  latestVersion: string
  minimumVersion: string
  downloadUrl: string
  downloadUrlWindows: string
  downloadUrlMacArm64: string
  downloadUrlMacX64: string
  releaseNotes: string
  publishedAt: string | null
}

export interface FeishuConfigPayload {
  enabled: boolean
  appId: string
  appSecret: string
  appToken: string
  tableId: string
  primaryFieldName: string
  baseUrl: string
}

export async function getSubscriptionPlans(): Promise<Record<string, TierInfo>> {
  const data = await request('/api/subscription/plans')
  return data.tiers
}

export async function getMySubscription(): Promise<SubscriptionInfo> {
  return request('/api/subscription/my')
}

export async function getLatestAppVersion(currentVersion: string, platformInfo?: ClientPlatformInfo): Promise<AppVersionInfo> {
  const params = new URLSearchParams({ currentVersion })
  if (platformInfo?.platform) params.set('platform', platformInfo.platform)
  if (platformInfo?.arch) params.set('arch', platformInfo.arch)
  return request(`/api/subscription/app-version?${params.toString()}`)
}

export async function getAdminAppVersionConfig(adminSecret: string): Promise<AdminAppVersionPayload> {
  return request('/api/subscription/app-version/admin/get', {
    method: 'POST',
    body: JSON.stringify({ adminSecret })
  })
}

export async function publishAppVersion(adminSecret: string, payload: AdminAppVersionPayload): Promise<{ success: boolean; config: AdminAppVersionPayload }> {
  return request('/api/subscription/app-version/admin/update', {
    method: 'POST',
    body: JSON.stringify({ adminSecret, ...payload })
  })
}

export async function getAdminFeishuConfig(adminSecret: string): Promise<FeishuConfigPayload> {
  return request('/api/feishu/admin/get', {
    method: 'POST',
    body: JSON.stringify({ adminSecret })
  })
}

export async function getMyFeishuConfig(): Promise<FeishuConfigPayload> {
  return request('/api/feishu/my')
}

export async function saveMyFeishuConfig(payload: FeishuConfigPayload): Promise<{ success: boolean; config: FeishuConfigPayload }> {
  return request('/api/feishu/my', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export async function bootstrapMyFeishuConfig(): Promise<{ success: boolean; config: FeishuConfigPayload }> {
  return request('/api/feishu/my/bootstrap', {
    method: 'POST',
    body: JSON.stringify({})
  })
}

export async function saveAdminFeishuConfig(adminSecret: string, payload: FeishuConfigPayload): Promise<{ success: boolean; config: FeishuConfigPayload }> {
  return request('/api/feishu/admin/update', {
    method: 'POST',
    body: JSON.stringify({ adminSecret, ...payload })
  })
}

export async function bootstrapAdminFeishuConfig(adminSecret: string): Promise<{ success: boolean; config: FeishuConfigPayload }> {
  return request('/api/feishu/admin/bootstrap', {
    method: 'POST',
    body: JSON.stringify({ adminSecret })
  })
}

export async function getProfile(): Promise<AuthUser & { subscriptionExpires?: string; createdAt?: string }> {
  const data = await request('/api/auth/me')
  _user = data.user
  localStorage.setItem('auth_user', JSON.stringify(_user))
  return data.user as AuthUser & { subscriptionExpires?: string; createdAt?: string }
}

// ---- Activation Codes ----

export async function generateActivationCodes(adminSecret: string, tier: string, count: number, durationDays: number): Promise<{ codes: string[] }> {
  return request('/api/activation/admin/generate', {
    method: 'POST',
    body: JSON.stringify({ adminSecret, tier, count, durationDays })
  })
}

export async function listActivationCodes(adminSecret: string): Promise<{ codes: Array<{ code: string; tier: string; duration_days: number; used_by: number | null; used_at: string | null; created_at: string }> }> {
  return request('/api/activation/admin/list', {
    method: 'POST',
    body: JSON.stringify({ adminSecret })
  })
}

export async function redeemCode(code: string): Promise<{ success: boolean; tier: string; expiresAt: string; message: string }> {
  return request('/api/activation/redeem', {
    method: 'POST',
    body: JSON.stringify({ code })
  })
}

// ---- AI Usage ----

export interface AiUsageInfo {
  used: number
  limit: number
  remaining: number
  tier: string
  extraCredits?: number
  periodKey?: string
  periodType?: 'daily' | 'monthly'
}

export async function getAiUsage(): Promise<AiUsageInfo> {
  return request('/api/ai-usage/remaining')
}

export async function incrementAiUsage(): Promise<AiUsageInfo> {
  return request('/api/ai-usage/increment', { method: 'POST' })
}

export async function extractOrderFromImageCloud(base64Image: string): Promise<{
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
}> {
  return request('/api/ocr/extract', {
    method: 'POST',
    body: JSON.stringify({ base64Image })
  })
}

// ---- Recharge ----

export async function redeemRechargeCode(code: string): Promise<{ success: boolean; credits: number; totalCredits: number; message: string }> {
  return request('/api/ai-usage/recharge/redeem', {
    method: 'POST',
    body: JSON.stringify({ code })
  })
}

// ---- Friends ----

export async function sendFriendRequest(email: string): Promise<{ success: boolean; message: string }> {
  return request('/api/friends/request', { method: 'POST', body: JSON.stringify({ email }) })
}

export async function getFriendRequests(): Promise<{ requests: Array<{ id: number; user_id: number; email: string; created_at: string }> }> {
  return request('/api/friends/requests')
}

export async function acceptFriendRequest(requestId: number): Promise<{ success: boolean }> {
  return request('/api/friends/accept', { method: 'POST', body: JSON.stringify({ requestId }) })
}

export async function rejectFriendRequest(requestId: number): Promise<{ success: boolean }> {
  return request('/api/friends/reject', { method: 'POST', body: JSON.stringify({ requestId }) })
}

export async function getFriendList(): Promise<{ friends: Array<{ id: number; email: string; friends_since: string }> }> {
  return request('/api/friends/list')
}

export async function removeFriend(friendId: number): Promise<{ success: boolean }> {
  return request('/api/friends/' + friendId, { method: 'DELETE' })
}

// ---- Collaboration ----

export async function shareOrder(orderId: string, friendId: number): Promise<{ success: boolean; message: string }> {
  return request('/api/collab/orders/' + orderId + '/share', { method: 'POST', body: JSON.stringify({ friendId }) })
}

export async function getOrderCollaborators(orderId: string): Promise<{ collaborators: Array<{ user_id: number; email: string; created_at: string }> }> {
  return request('/api/collab/orders/' + orderId + '/collaborators')
}

export async function getSharedOrders(): Promise<{ orders: any[] }> {
  return request('/api/collab/shared-with-me')
}

export async function getAssistedShipments(): Promise<{ orders: any[] }> {
  return request('/api/collab/shipments/assisted-by-me')
}

export async function getSharedOrderDispatchOptions(orderId: string): Promise<{ order: any; devices: any[] }> {
  return request('/api/collab/orders/' + orderId + '/dispatch-options')
}

export async function dispatchSharedOrder(orderId: string, serialNumber: string, trackingNumber: string): Promise<{ success: boolean; message: string; order: any }> {
  return request('/api/collab/orders/' + orderId + '/dispatch', {
    method: 'POST',
    body: JSON.stringify({ serialNumber, trackingNumber })
  })
}

export async function removeCollaborator(orderId: string, userId: number): Promise<{ success: boolean }> {
  return request('/api/collab/orders/' + orderId + '/share/' + userId, { method: 'DELETE' })
}

// ---- Enterprise ----

export async function createEnterprise(name: string): Promise<{ id: number; name: string; inviteCode: string; role: string; message: string }> {
  return request('/api/enterprise/create', { method: 'POST', body: JSON.stringify({ name }) })
}

export async function joinEnterprise(code: string): Promise<{ success: boolean; enterpriseName: string; message: string }> {
  return request('/api/enterprise/join', { method: 'POST', body: JSON.stringify({ code }) })
}

export async function getMyEnterprise(): Promise<{ enterprise: { id: number; name: string; invite_code: string; owner_id: number; role: string; created_at: string } | null }> {
  return request('/api/enterprise/my')
}

export async function getEnterpriseMembers(): Promise<{ members: Array<{ id: number; email: string; role: string; joined_at: string }>; myRole: string }> {
  return request('/api/enterprise/members')
}

export async function kickEnterpriseMember(userId: number): Promise<{ success: boolean }> {
  return request('/api/enterprise/kick', { method: 'POST', body: JSON.stringify({ userId }) })
}

export async function leaveEnterprise(): Promise<{ success: boolean }> {
  return request('/api/enterprise/leave', { method: 'POST' })
}

export async function regenerateInviteCode(): Promise<{ inviteCode: string }> {
  return request('/api/enterprise/regenerate-code', { method: 'POST' })
}

export async function getEnterpriseOrders(): Promise<{ orders: any[] }> {
  return request('/api/enterprise/orders')
}

export async function getEnterpriseDevices(): Promise<{ devices: any[] }> {
  return request('/api/enterprise/devices')
}

export async function deleteEnterpriseOrder(orderId: string): Promise<{ success: boolean }> {
  return request('/api/enterprise/orders/' + encodeURIComponent(orderId), { method: 'DELETE' })
}

export async function dispatchEnterpriseOrder(orderId: string, serialNumber: string, trackingNumber: string): Promise<{ success: boolean; message: string; order: any }> {
  return request('/api/enterprise/orders/' + encodeURIComponent(orderId) + '/dispatch', {
    method: 'POST',
    body: JSON.stringify({ serialNumber, trackingNumber })
  })
}

export async function returnEnterpriseOrder(orderId: string): Promise<{ success: boolean; order: any }> {
  return request('/api/enterprise/orders/' + encodeURIComponent(orderId) + '/return', {
    method: 'POST',
    body: JSON.stringify({})
  })
}

export async function forwardEnterpriseOrder(orderId: string, targetOrderId: string, trackingNumber: string): Promise<{ success: boolean; message: string }> {
  return request('/api/enterprise/orders/' + encodeURIComponent(orderId) + '/forward', {
    method: 'POST',
    body: JSON.stringify({ targetOrderId, trackingNumber })
  })
}

export async function deleteEnterpriseDevice(deviceId: string): Promise<{ success: boolean }> {
  return request('/api/enterprise/devices/' + encodeURIComponent(deviceId), { method: 'DELETE' })
}
