import brandMark from '../../../../resources/brand/robohorse-32.png'

export function WindowTitleBar({ title }: { title: string }): React.JSX.Element | null {
  if (!window.studioWindowChrome?.customTitleBar) return null
  return <div className="window-titlebar" aria-label="窗口标题栏">
    <img src={brandMark} alt="" />
    <span>{title}</span>
  </div>
}
