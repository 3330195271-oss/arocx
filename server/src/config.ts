const DEV_DEFAULTS: Record<string, string> = {
  JWT_SECRET: 'warehouse-dev-secret-change-in-production',
  ADMIN_SECRET: 'rjkf-admin-dev-secret'
}

function isUnsafeProductionValue(name: string, value: string): boolean {
  const defaultValue = DEV_DEFAULTS[name]
  return value === defaultValue || value.startsWith('change-this')
}

export function getRequiredSecret(name: 'JWT_SECRET' | 'ADMIN_SECRET'): string {
  const value = process.env[name]?.trim()
  const isProduction = process.env.NODE_ENV === 'production'

  if (value && !(isProduction && isUnsafeProductionValue(name, value))) {
    return value
  }

  if (isProduction) {
    throw new Error(`${name} must be set to a strong value in production`)
  }

  console.warn(`[config] ${name} is not set; using development fallback`)
  return DEV_DEFAULTS[name]
}

export function getJwtSecret(): string {
  return getRequiredSecret('JWT_SECRET')
}

export function getAdminSecret(): string {
  return getRequiredSecret('ADMIN_SECRET')
}
