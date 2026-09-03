import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThirdwebProvider, darkTheme } from 'thirdweb/react'
import { client } from './lib/thirdweb'
import './index.css'
import Home from './routes/Home'
import Verify from './routes/Verify'
import SignUp from './routes/SignUp'
import SignUpDone from './routes/SignUpDone'
import Help from './routes/Help'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThirdwebProvider
        client={client}
        theme={darkTheme({
          colors: {
            primaryButton: '#2dd4a7',
            secondaryButton: '#6b7f87',
            buttonText: '#0a0e0f',
            modalBg: '#0a0e0f',
          },
        })}
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/signup/done" element={<SignUpDone />} />
          <Route path="/docs" element={<Help />} />
        </Routes>
      </ThirdwebProvider>
    </BrowserRouter>
  </StrictMode>,
)
