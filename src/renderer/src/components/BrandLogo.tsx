import brandMark from '../../../../resources/brand/robohorse-mark.png'

/** Full lockup for the welcome surface; the compact topbar keeps its own h1. */
export function BrandLogo(): React.JSX.Element {
  return <span className="brand-logo"><img src={brandMark} width="46" height="46" alt="" /><span>RoboHorse <em>Studio</em></span></span>
}
