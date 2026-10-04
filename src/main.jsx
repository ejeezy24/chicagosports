import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Local display fonts keep the editorial shell and arcade independent of font CDNs.
import '@fontsource/press-start-2p/400.css'
import '@fontsource/silkscreen/400.css'
import '@fontsource/silkscreen/700.css'
import '@fontsource/barlow-condensed/latin-600.css'
import '@fontsource/barlow-condensed/latin-700.css'
import App from './App.jsx'
import { FanProvider } from './FanContext.jsx'
import './index.css'
import './night-game.css'
import './fan.css'
import './design-system.css'
import './shell-layout.css'
import './team-theme.css'
import './panel-layout.css'
import './motion.css'
import './editorial-features.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <FanProvider><App /></FanProvider>
  </StrictMode>,
)
