export type TabKey = 'dashboard' | 'screenshot' | 'inventory' | 'orders' | 'shipping' | 'forwarding' | 'settings' | 'admin' | 'friends' | 'enterprise' | 'feishu'

interface NavTabsProps {
  active: TabKey
  onSelect: (tab: TabKey) => void
}

const tabs: { key: TabKey; emoji: string; label: string }[] = [
  { key: 'dashboard', emoji: '📊', label: '仪表盘' },
  { key: 'screenshot', emoji: '📸', label: '截图录单' },
  { key: 'inventory', emoji: '📦', label: '设备库存' },
  { key: 'orders', emoji: '📋', label: '订单管理' },
  { key: 'shipping', emoji: '📮', label: '发货信息' },
  { key: 'forwarding', emoji: '🔄', label: '转寄推荐' },
  { key: 'settings', emoji: '⚙️', label: '设置' },
  { key: 'admin', emoji: '🔑', label: '管理员' }
]

export function NavTabs({ active, onSelect }: NavTabsProps): JSX.Element {
  return (
    <div className="nav-tabs">
      {tabs.map(tab => (
        <button
          key={tab.key}
          data-key={tab.key} className={`nav-tab ${active === tab.key ? 'nav-tab--active' : ''}`}
          onClick={() => onSelect(tab.key)}
        >
          <span className="nav-tab__emoji">{tab.emoji}</span>
          <span className="nav-tab__label">{tab.label}</span>
        </button>
      ))}
    </div>
  )
}
