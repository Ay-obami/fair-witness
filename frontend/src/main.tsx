import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Home from './routes/Home'
import Verify from './routes/Verify'
import SignUp from './routes/SignUp'
import SignUpDone from './routes/SignUpDone'
import Help from './routes/Help'
import Dashboard from './routes/Dashboard'

// GitHub Pages SPA fallback: `public/404.html` stashes the real path+query in
// sessionStorage before redirecting to `/`;restore it here so a hard refresh on
// /signup/done?address=… (or any deep route) lands back on the same route instead
// of the root. No-op on hosts with real SPA rewrites (`vite dev`, Vercel, Netlify).
const pendingRedirect = sessionStorage.getItem('fw:redirect')
if (pendingRedirect) {
  sessionStorage.removeItem('fw:redirect')
  window.history.replaceState(null, '', pendingRedirect)
}

// No ThirdwebProvider: thirdweb v5.121's provider takes no client/theme, and no
// route uses thirdweb React context — the wallet session is handled directly via
// src/lib/thirdweb (see Dashboard.tsx for the session-restore pattern).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/signup/done" element={<SignUpDone />} />
        <Route path="/docs" element={<Help />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
