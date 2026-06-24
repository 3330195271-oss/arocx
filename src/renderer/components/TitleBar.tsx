export function TitleBar(): JSX.Element {
  const isMac = navigator.userAgent.includes('Mac') || navigator.platform.includes('Mac')

  return (
    <div className="title-bar">
      <span className="title-bar__label" style={isMac ? { marginLeft: '70px' } : undefined}>
        arocx
      </span>
      {!isMac && (
        <div className="title-bar__controls">
          <button
            className="title-bar__btn title-bar__btn--minimize"
            onClick={() => window.electronAPI.minimize()}
            aria-label="最小化"
          />
          <button
            className="title-bar__btn title-bar__btn--maximize"
            onClick={() => window.electronAPI.maximize()}
            aria-label="最大化"
          />
          <button
            className="title-bar__btn title-bar__btn--close"
            onClick={() => window.electronAPI.close()}
            aria-label="关闭"
          />
        </div>
      )}
    </div>
  )
}
