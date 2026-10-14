import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import 'katex/dist/katex.min.css'
import './fonts.css'
import './styles.css'
import { STUDIO_THEME } from '../../shared/studio-theme'

for (const [name, value] of Object.entries(STUDIO_THEME)) {
  document.documentElement.style.setProperty(`--${name}`, value)
}

if (window.studioWindowChrome?.customTitleBar) {
  document.documentElement.style.setProperty('--window-chrome-height', `${window.studioWindowChrome.height}px`)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
