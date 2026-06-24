interface StatusBarProps {
  lastUpdated?: string
  customerCount?: number
  autoSync?: boolean
  syncCountdown?: number
  syncing?: boolean
}

export function StatusBar({ lastUpdated, customerCount, autoSync, syncCountdown, syncing }: StatusBarProps): JSX.Element {
  return (
    <div className="status-bar">
      <span>
        {lastUpdated ? `数据更新于 ${lastUpdated}` : '尚未加载数据'}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {autoSync !== undefined && (
          <span style={{
            fontSize: '11px',
            color: autoSync ? (syncing ? '#e67e22' : '#2e7d32') : 'var(--text-tertiary)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <span style={{
              display: 'inline-block',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: autoSync ? (syncing ? '#e67e22' : '#2e7d32') : '#ccc',
              animation: autoSync && !syncing ? 'pulse 2s infinite' : 'none'
            }} />
            {autoSync
              ? (syncing ? '同步中...' : `自动同步 ${syncCountdown}s`)
              : '自动同步已关闭'}
          </span>
        )}
        {customerCount !== undefined ? `共 ${customerCount} 个客户` : ''}
      </span>
    </div>
  )
}
