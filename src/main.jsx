import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Keep the arcade display faces local; scores and reading text use system fonts.
import '@fontsource/press-start-2p/400.css'
import '@fontsource/silkscreen/400.css'
import '@fontsource/silkscreen/700.css'
import App from './App.jsx'
import { FanProvider } from './FanContext.jsx'
import './index.css'
import './night-game.css'
import './fan.css'
import './design-system.css'
import './shell-layout.css'
import './panel-layout.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <FanProvider><App /></FanProvider>
  </StrictMode>,
)
