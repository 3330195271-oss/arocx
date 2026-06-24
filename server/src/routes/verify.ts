import { Router, Request, Response } from 'express'
import { randomInt } from 'crypto'
import { query } from '../db'

const router = Router()
const APP_MAIL_NAME = process.env.SMTP_FROM_NAME || 'arocx'

// Generate 6-digit code
function generateCode(): string {
  return String(randomInt(100000, 999999))
}

// Send email via fetch (using a simple HTTP email service)
// Supports: custom SMTP via nodemailer, or a simple fetch-based approach
async function sendEmail(to: string, code: string): Promise<boolean> {
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com'
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  const smtpFrom = process.env.SMTP_FROM || smtpUser

  // If SMTP not configured, log to console (dev mode)
  if (!smtpUser || !smtpPass) {
    console.log(`[verify] SMTP not configured. Verification code for ${to}: ${code}`)
    return true
  }

  try {
    const nodemailer = await import('nodemailer')
    const transporter = nodemailer.default.createTransport({
      host: smtpHost,
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: true,
      auth: { user: smtpUser, pass: smtpPass }
    })

    await transporter.sendMail({
      from: `"${APP_MAIL_NAME}" <${smtpFrom}>`,
      to,
      subject: `验证码 - ${APP_MAIL_NAME}`,
      html: `
        <div style="max-width:480px;margin:0 auto;padding:24px;font-family:Arial,sans-serif">
          <h2 style="color:#5b3cc4">📦 ${APP_MAIL_NAME}</h2>
          <p>你的验证码是：</p>
          <div style="font-size:32px;font-weight:700;color:#5b3cc4;letter-spacing:6px;padding:16px;background:#f5f0ff;border-radius:8px;text-align:center;margin:16px 0">
            ${code}
          </div>
          <p style="color:#666;font-size:13px">验证码 5 分钟内有效，请勿泄露给他人。</p>
        </div>
      `
    })
    console.log(`[verify] Email sent to ${to}`)
    return true
  } catch (err: any) {
    console.error(`[verify] Email send failed:`, err.message)
    return false
  }
}

// POST /api/verify/send-code
router.post('/send-code', async (req: Request, res: Response) => {
  try {
    const { email } = req.body
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      res.status(400).json({ error: '请输入有效的邮箱地址' })
      return
    }
    const normalizedEmail = email.trim().toLowerCase()

    // Check if email already registered
    const existing = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail])
    if (existing.rows.length > 0) {
      res.status(409).json({ error: '该邮箱已注册' })
      return
    }

    // Rate limit: max 3 codes per email per 5 minutes
    const recent = await query(
      `SELECT COUNT(*) as cnt FROM verification_codes 
       WHERE email = $1 AND created_at > NOW() - INTERVAL '5 minutes'`,
      [normalizedEmail]
    )
    if (parseInt(recent.rows[0].cnt) >= 3) {
      res.status(429).json({ error: '发送太频繁，请 5 分钟后再试' })
      return
    }

    // Generate and store code
    const code = generateCode()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes

    await query(
      `INSERT INTO verification_codes (email, code, expires_at) VALUES ($1, $2, $3)`,
      [normalizedEmail, code, expiresAt.toISOString()]
    )

    // Send email
    const sent = await sendEmail(normalizedEmail, code)
    if (!sent) {
      res.status(500).json({ error: '邮件发送失败，请检查 SMTP 配置' })
      return
    }

    res.json({ success: true, message: '验证码已发送' })
  } catch (err: any) {
    console.error('[verify] send-code error:', err.message)
    res.status(500).json({ error: '发送失败' })
  }
})

// POST /api/verify/verify-code
router.post('/verify-code', async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body
    if (!email || !code) {
      res.status(400).json({ error: '邮箱和验证码不能为空' })
      return
    }
    const normalizedEmail = email.trim().toLowerCase()

    // Find valid code
    const result = await query(
      `SELECT id FROM verification_codes 
       WHERE email = $1 AND code = $2 AND expires_at > NOW() AND used = false
       ORDER BY created_at DESC LIMIT 1`,
      [normalizedEmail, code.trim()]
    )

    if (result.rows.length === 0) {
      res.status(400).json({ error: '验证码错误或已过期' })
      return
    }

    // Mark code as used
    await query('UPDATE verification_codes SET used = true WHERE id = $1', [result.rows[0].id])

    res.json({ success: true, verified: true })
  } catch (err: any) {
    console.error('[verify] verify-code error:', err.message)
    res.status(500).json({ error: '验证失败' })
  }
})

export default router
