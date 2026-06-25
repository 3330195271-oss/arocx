import { useState } from 'react'
import { login, register, sendVerifyCode } from '../services/api-client'

const logoIcon = new URL('../../../resources/logo-aro-icon.png', import.meta.url).href

interface LoginPageProps {
  onLogin: () => Promise<void> | void
  notice?: string | null
}

export function LoginPage({ onLogin, notice = null }: LoginPageProps): JSX.Element {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [verifyCode, setVerifyCode] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await register(email, password, verifyCode)
      }
      await onLogin()
    } catch (err: any) {
      setError(err.message || '操作失败')
    } finally {
      setLoading(false)
    }
  }

  async function handleSendCode() {
    if (!email.trim()) {
      setError('请先输入邮箱')
      return
    }

    setSendingCode(true)
    setError(null)
    try {
      await sendVerifyCode(email.trim())
      setCodeSent(true)
      setCountdown(60)
      const timer = window.setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            window.clearInterval(timer)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } catch (err: any) {
      setError(err.message || '验证码发送失败')
    } finally {
      setSendingCode(false)
    }
  }

  function switchMode() {
    setMode(mode === 'login' ? 'register' : 'login')
    setError(null)
    setVerifyCode('')
    setCodeSent(false)
    setCountdown(0)
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: 'var(--bg-primary)'
    }}>
      <div style={{
        width: '380px', padding: '40px', background: 'var(--bg-secondary)',
        borderRadius: '16px', boxShadow: 'var(--shadow-lg)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <img
            src={logoIcon}
            alt="arocx"
            style={{
              width: '52px',
              height: '52px',
              display: 'block',
              margin: '0 auto 10px',
              borderRadius: '14px',
              boxShadow: '0 8px 22px rgba(0, 0, 0, 0.08)'
            }}
          />
          <h2 style={{ fontSize: '20px', fontWeight: 600, margin: 0 }}>arocx</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
            {mode === 'login' ? '登录你的账号' : '创建新账号'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '12px' }}>
            <label className="form-label">邮箱</label>
            <input
              className="form-input"
              style={{ width: '100%', height: '38px' }}
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label">密码</label>
            <input
              className="form-input"
              style={{ width: '100%', height: '38px' }}
              type="password"
              placeholder="至少 6 位"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          {mode === 'register' && (
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="form-label">邮箱验证码</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  className="form-input"
                  style={{ width: '100%', height: '38px' }}
                  type="text"
                  placeholder="输入 6 位验证码"
                  value={verifyCode}
                  onChange={e => setVerifyCode(e.target.value)}
                  maxLength={6}
                />
                <button
                  type="button"
                  className="settings-panel__btn settings-panel__btn--secondary"
                  onClick={handleSendCode}
                  disabled={sendingCode || countdown > 0}
                  style={{ width: '116px', height: '38px', flexShrink: 0 }}
                >
                  {sendingCode ? '发送中...' : countdown > 0 ? `${countdown}s` : codeSent ? '重新发送' : '发送验证码'}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div style={{
              padding: '8px 12px', background: '#ffebee', borderRadius: '8px',
              fontSize: '12px', color: '#c62828', marginBottom: '12px'
            }}>
              {error}
            </div>
          )}

          {!error && notice && (
            <div style={{
              padding: '8px 12px', background: '#fff4e5', borderRadius: '8px',
              fontSize: '12px', color: '#b26a00', marginBottom: '12px', whiteSpace: 'pre-line'
            }}>
              {notice}
            </div>
          )}

          <button
            className="settings-panel__btn settings-panel__btn--primary"
            type="submit"
            disabled={loading || (mode === 'register' && !verifyCode.trim())}
            style={{ width: '100%', height: '42px', fontSize: '14px', marginBottom: '12px' }}
          >
            {loading ? '请稍候...' : mode === 'login' ? '登录' : '注册'}
          </button>
        </form>

        <div style={{ textAlign: 'center' }}>
          <button
            onClick={switchMode}
            style={{
              background: 'none', border: 'none', color: 'var(--accent)',
              fontSize: '13px', cursor: 'pointer'
            }}
          >
            {mode === 'login' ? '没有账号？去注册' : '已有账号？去登录'}
          </button>
        </div>


      </div>
    </div>
  )
}
