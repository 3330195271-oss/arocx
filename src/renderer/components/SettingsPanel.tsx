import type { WpsConfig } from '../types/customer'

interface SettingsPanelProps {
  config: WpsConfig
  onChange: (config: WpsConfig) => void
  onFetch: () => void
  loading: boolean
}

export function SettingsPanel({ config, onChange, onFetch, loading }: SettingsPanelProps): JSX.Element {
  return (
    <div className="settings-panel">
      <div className="settings-panel__row">
        <input
          className="settings-panel__input"
          type="text"
          placeholder="WPS 共享链接 (https://www.kdocs.cn/l/...)"
          value={config.shareUrl}
          onChange={(e) => onChange({ ...config, shareUrl: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') onFetch() }}
        />
        <button
          className="settings-panel__btn settings-panel__btn--primary"
          onClick={onFetch}
          disabled={loading}
        >
          {loading ? '加载中...' : '获取数据'}
        </button>
      </div>
      <div className="settings-panel__row">
        <input
          className="settings-panel__input"
          type="text"
          placeholder="Client ID (APPID)"
          value={config.clientId}
          onChange={(e) => onChange({ ...config, clientId: e.target.value })}
        />
        <input
          className="settings-panel__input"
          type="password"
          placeholder="Client Secret (APPKEY)"
          value={config.clientSecret}
          onChange={(e) => onChange({ ...config, clientSecret: e.target.value })}
        />
      </div>
    </div>
  )
}
