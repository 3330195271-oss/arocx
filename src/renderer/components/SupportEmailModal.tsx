import { SUPPORT_EMAIL } from '../utils/external-links'

interface SupportEmailModalProps {
  open: boolean
  onClose: () => void
  onCopyEmail: () => Promise<void>
  onOpenMail: () => Promise<void>
  message?: { type: 'success' | 'error'; text: string } | null
}

export function SupportEmailModal({
  open,
  onClose,
  onCopyEmail,
  onOpenMail,
  message = null
}: SupportEmailModalProps): JSX.Element | null {
  if (!open) return null

  return (
    <div className="dispatch-overlay" onClick={onClose}>
      <div className="dispatch-dialog" onClick={event => event.stopPropagation()} style={{ width: '460px', maxWidth: '92vw' }}>
        <div className="dispatch-dialog__title" style={{ color: '#0f766e' }}>
          技术支持
        </div>

        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          遇到使用问题、功能异常，或者想反馈建议，都可以通过下面的邮箱联系我们。
        </div>

        <div style={{
          marginTop: '14px',
          padding: '14px 16px',
          borderRadius: '12px',
          background: '#f8fafc',
          border: '1px solid var(--border)'
        }}>
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '6px' }}>
            技术支持邮箱
          </div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
            {SUPPORT_EMAIL}
          </div>
        </div>

        {message && (
          <div style={{
            marginTop: '12px',
            padding: '10px 12px',
            borderRadius: '10px',
            fontSize: '12px',
            lineHeight: 1.7,
            background: message.type === 'success' ? '#f1f8e9' : '#fff8e1',
            color: message.type === 'success' ? '#2e7d32' : '#b26a00',
            border: `1px solid ${message.type === 'success' ? '#c8e6c9' : '#ffe0b2'}`
          }}>
            {message.text}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
          <button
            className="settings-panel__btn settings-panel__btn--secondary"
            onClick={() => {
              onCopyEmail().catch(() => {})
            }}
            style={{ fontSize: '12px', height: '34px' }}
          >
            复制邮箱
          </button>
          <button
            className="settings-panel__btn settings-panel__btn--primary"
            onClick={() => {
              onOpenMail().catch(() => {})
            }}
            style={{ fontSize: '12px', height: '34px' }}
          >
            一键发邮件
          </button>
          <button
            className="settings-panel__btn settings-panel__btn--secondary"
            onClick={onClose}
            style={{ fontSize: '12px', height: '34px' }}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
