import { Pool } from 'pg'

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'warehouse',
  user: process.env.DB_USER || 'warehouse',
  password: process.env.DB_PASSWORD || 'warehouse'
})

export async function query(text: string, params?: any[]) {
  return pool.query(text, params)
}

export async function initDb(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      subscription_tier VARCHAR(20) DEFAULT 'free',
      subscription_expires TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      active_device_id VARCHAR(128) DEFAULT '',
      active_device_name VARCHAR(255) DEFAULT '',
      session_version INTEGER NOT NULL DEFAULT 0,
      last_login_at TIMESTAMPTZ
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS orders (
      id VARCHAR(64) PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      customer_name VARCHAR(255) NOT NULL,
      customer_phone VARCHAR(20),
      customer_address TEXT,
      platform VARCHAR(50) DEFAULT '',
      cs_rep VARCHAR(50) DEFAULT '',
      remarks TEXT DEFAULT '',
      device_id VARCHAR(100) DEFAULT '',
      serial_number VARCHAR(100) DEFAULT '',
      tracking_number VARCHAR(100) DEFAULT '',
      shipment_date VARCHAR(20) DEFAULT '',
      rental_start VARCHAR(20) DEFAULT '',
      rental_end VARCHAR(20) DEFAULT '',
      dispatch_date VARCHAR(20) DEFAULT '',
      return_date VARCHAR(20) DEFAULT '',
      status VARCHAR(20) DEFAULT 'pending',
      forwarded_from_order_id VARCHAR(64) DEFAULT '',
      forwarded_to_order_id VARCHAR(64) DEFAULT '',
      forward_tracking VARCHAR(100) DEFAULT '',
      friend_dispatch_helper_user_id INTEGER,
      friend_dispatch_helper_email VARCHAR(255) DEFAULT '',
      feishu_record_id VARCHAR(100) DEFAULT '',
      feishu_sync_status VARCHAR(20) DEFAULT '',
      feishu_sync_error TEXT DEFAULT '',
      feishu_synced_at TIMESTAMPTZ,
      synced_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS devices (
      id VARCHAR(64) PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      serial_number VARCHAR(255) NOT NULL,
      device_id VARCHAR(100) DEFAULT '',
      status VARCHAR(20) DEFAULT 'idle',
      current_order_id VARCHAR(64) DEFAULT '',
      created_at VARCHAR(20) DEFAULT '',
      synced_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  // Indexes
  await query(`CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id)`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS active_device_id VARCHAR(128) DEFAULT ''`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS active_device_name VARCHAR(255) DEFAULT ''`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`)
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS feishu_record_id VARCHAR(100) DEFAULT ''`)
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS feishu_sync_status VARCHAR(20) DEFAULT ''`)
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS feishu_sync_error TEXT DEFAULT ''`)
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS feishu_synced_at TIMESTAMPTZ`)
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS friend_dispatch_helper_user_id INTEGER`)
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS friend_dispatch_helper_email VARCHAR(255) DEFAULT ''`)

  await query(`
    CREATE TABLE IF NOT EXISTS verification_codes (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      code VARCHAR(10) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS idx_vcodes_email ON verification_codes(email)`)
  await query(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`)

  await query(`
    CREATE TABLE IF NOT EXISTS activation_codes (
      id SERIAL PRIMARY KEY,
      code VARCHAR(32) UNIQUE NOT NULL,
      tier VARCHAR(20) NOT NULL,
      duration_days INTEGER NOT NULL DEFAULT 30,
      created_by VARCHAR(64) DEFAULT 'admin',
      used_by INTEGER REFERENCES users(id),
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS ai_usage (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      period_key VARCHAR(10) NOT NULL,
      count INTEGER NOT NULL DEFAULT 1,
      extra_used INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, period_key)
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS idx_ai_usage_user_period ON ai_usage(user_id, period_key)`)

    // Add extra_credits to users (safe ALTER)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS extra_credits INTEGER DEFAULT 0`)

  // Recharge codes table
  await query(`
    CREATE TABLE IF NOT EXISTS recharge_codes (
      id SERIAL PRIMARY KEY,
      code VARCHAR(32) UNIQUE NOT NULL,
      credits INTEGER NOT NULL DEFAULT 100,
      created_by VARCHAR(64) DEFAULT 'admin',
      used_by INTEGER REFERENCES users(id),
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  
  // Friends
  await query(`
    CREATE TABLE IF NOT EXISTS friends (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      friend_id INTEGER REFERENCES users(id),
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, friend_id)
    )
  `)

  // Order collaborators
  await query(`
    CREATE TABLE IF NOT EXISTS order_collaborators (
      id SERIAL PRIMARY KEY,
      order_id VARCHAR(64) NOT NULL,
      user_id INTEGER REFERENCES users(id),
      added_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(order_id, user_id)
    )
  `)

  
  // Enterprise
  await query(`
    CREATE TABLE IF NOT EXISTS enterprises (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      owner_id INTEGER REFERENCES users(id),
      invite_code VARCHAR(16) UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS enterprise_members (
      id SERIAL PRIMARY KEY,
      enterprise_id INTEGER REFERENCES enterprises(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      role VARCHAR(20) NOT NULL DEFAULT 'member',
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(enterprise_id, user_id)
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS user_feishu_settings (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      enabled BOOLEAN NOT NULL DEFAULT false,
      app_id VARCHAR(255) NOT NULL DEFAULT '',
      app_secret VARCHAR(255) NOT NULL DEFAULT '',
      app_token VARCHAR(255) NOT NULL DEFAULT '',
      table_id VARCHAR(255) NOT NULL DEFAULT '',
      primary_field_name VARCHAR(100) NOT NULL DEFAULT '订单标题',
      base_url TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS user_ocr_settings (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      api_key TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)

  console.log('[db] Database initialized')
}
