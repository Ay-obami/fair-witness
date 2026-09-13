import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import './mobile-polish.css'
import Home from './routes/Home'
import Verify from './routes/Verify'
import DecisionDetail from './routes/DecisionDetail'
import Treasury from './routes/Treasury'
import Architecture from './routes/Architecture'
import SignUp from './routes/SignUp'
import SignUpDone from './routes/SignUpDone'
import Help from './routes/Help'
import Dashboard from './routes/Dashboard'
import Activity from './routes/Activity'
import Safeguards from './routes/Safeguards'
import NotFound from './routes/notFound'
import Mandate from './routes/Mandate'
import Demo from './routes/Demo'
import { ErrorBoundary } from './components/errorBoundary'
import { AuthSessionProvider } from './lib/authSession'

const pendingRedirect = sessionStorage.getItem('fw:redirect')
if (pendingRedirect) {
  sessionStorage.removeItem('fw:redirect')
  window.history.replaceState(null, '', pendingRedirect)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <AuthSessionProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="/decision/:treasury/:attemptId" element={<DecisionDetail />} />
            <Route path="/safeguards" element={<Safeguards />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/treasury" element={<Treasury />} />
            <Route path="/architecture" element={<Architecture />} />
            <Route path="/action/*" element={<Navigate to="/verify" replace />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/mandate" element={<Mandate />} />
            <Route path="/evidence" element={<Demo />} />
            <Route path="/demo" element={<Navigate to="/evidence" replace />} />
            <Route path="/signup/done" element={<SignUpDone />} />
            <Route path="/docs" element={<Help />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthSessionProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
)