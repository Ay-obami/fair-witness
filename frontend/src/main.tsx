import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import Home from './routes/Home'
import Verify from './routes/Verify'
import ActionDetail from './routes/ActionDetail'
import Treasury from './routes/Treasury'
import Architecture from './routes/Architecture'
import SignUp from './routes/SignUp'
import SignUpDone from './routes/SignUpDone'
import Help from './routes/Help'
import Dashboard from './routes/Dashboard'
import NotFound from './routes/notFound'
import Mandate from './routes/Mandate'
import Demo from './routes/Demo'
import { ErrorBoundary } from './components/errorBoundary'

const pendingRedirect = sessionStorage.getItem('fw:redirect')
if (pendingRedirect) {
  sessionStorage.removeItem('fw:redirect')
  window.history.replaceState(null, '', pendingRedirect)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/treasury" element={<Treasury />} />
          <Route path="/architecture" element={<Architecture />} />
          <Route path="/action/:actionKey" element={<ActionDetail />} />
          <Route path="/action/:actionKey/:instance" element={<ActionDetail />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/mandate" element={<Mandate />} />
          <Route path="/evidence" element={<Demo />} />
          <Route path="/demo" element={<Navigate to="/evidence" replace />} />
          <Route path="/signup/done" element={<SignUpDone />} />
          <Route path="/docs" element={<Help />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
)
