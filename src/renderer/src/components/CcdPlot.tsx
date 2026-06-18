import type { CcdFrame } from '../../../shared/types'

interface CcdPlotProps {
  frame: CcdFrame
}

export function CcdPlot({ frame }: CcdPlotProps): React.JSX.Element {
  const width = 720
  const height = 230
  const points = frame.pixels
    .map((value, index) => `${(index / 127) * width},${height - (value / 255) * height}`)
    .join(' ')
  const centerX = (frame.center / 127) * width
  const targetX = (frame.target / 127) * width
  const thresholdY = height - (frame.threshold / 255) * height

  return (
    <div className="ccd-plot" aria-label="CCD 128 像素曲线">
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        <defs>
          <linearGradient id="ccd-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#00a8c6" stopOpacity="0.28" />
            <stop offset="1" stopColor="#00a8c6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line key={ratio} x1="0" y1={height * ratio} x2={width} y2={height * ratio} className="chart-grid" />
        ))}
        <line x1="0" y1={thresholdY} x2={width} y2={thresholdY} className="threshold-line" />
        <line x1={targetX} y1="0" x2={targetX} y2={height} className="target-line" />
        <line x1={centerX} y1="0" x2={centerX} y2={height} className="center-line" />
        <polygon points={`0,${height} ${points} ${width},${height}`} fill="url(#ccd-fill)" />
        <polyline points={points} fill="none" className="ccd-line" />
      </svg>
      <div className="chart-legend">
        <span><i className="legend-swatch sensor" /> CCD 像素</span>
        <span><i className="legend-swatch threshold" /> 阈值 {frame.threshold}</span>
        <span><i className="legend-swatch center" /> 黑线中心 {frame.center}</span>
      </div>
    </div>
  )
}
