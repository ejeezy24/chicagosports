import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Bitmap faces, bundled rather than pulled from a CDN so the look survives
// offline: Press Start 2P for chrome, Silkscreen for the dense data.
import '@fontsource/press-start-2p/400.css'
import '@fontsource/silkscreen/400.css'
import '@fontsource/silkscreen/700.css'
import App from './App.jsx'
import './index.css'
import './night-game.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
