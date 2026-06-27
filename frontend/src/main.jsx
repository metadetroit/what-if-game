import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './index.css'

// Fix iOS Safari viewport height jitter.
// Only recompute --vh when the viewport WIDTH changes (true orientation/layout
// change). Ignoring height-only resizes prevents the address-bar show/hide
// feedback loop that causes continuous jostling on mobile.
let lastWidth = window.innerWidth
const setVh = () => {
  const vh = window.innerHeight * 0.01
  document.documentElement.style.setProperty('--vh', `${vh}px`)
}
setVh()
window.addEventListener('resize', () => {
  if (window.innerWidth !== lastWidth) {
    lastWidth = window.innerWidth
    setVh()
  }
})
window.addEventListener('orientationchange', () => {
  lastWidth = window.innerWidth
  setVh()
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
