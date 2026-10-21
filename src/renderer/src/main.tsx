import React from 'react'
import ReactDOM from 'react-dom/client'
import './lib/monaco-bootstrap'
import { App } from './App'
import 'katex/dist/katex.min.css'
import './fonts.css'
import './styles.css'
import './dark-theme.css'
import { applyStudioTheme, readStudioTheme } from './lib/studio-theme'

applyStudioTheme(readStudioTheme())

if (window.studioWindowChrome?.customTitleBar) {
  document.documentElement.style.setProperty('--window-chrome-height', `${window.studioWindowChrome.height}px`)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
