import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './styles/theme.css'
import './index.css'
import App from './App.jsx'
import { LegalRoutesLayout } from './pages/LegalRoutesLayout.jsx'
import { SupportPage } from './pages/SupportPage.jsx'
import { ContactPage } from './pages/ContactPage.jsx'
import { PrivacyPage } from './pages/PrivacyPage.jsx'

// Suppress harmless CORS errors from RSS feed HTML rendering
// These occur when browser tries to load external resources (spritemap.svg, etc.)
// referenced in RSS feed HTML. They're harmless since we only display text content.
const originalError = console.error
const originalWarn = console.warn

// Filter console errors to suppress harmless CORS/resource loading errors
console.error = function(...args) {
  const message = String(args.join(' '))
  // Suppress specific CORS/resource loading errors that are harmless
  // These occur when RSS feed HTML references external resources (spritemap.svg, etc.)
  if (message.includes('spritemap') || 
      message.includes('Unsafe attempt to load URL') ||
      message.includes('from frame') ||
      message.includes('Domains, protocols and ports must match') ||
      message.includes('mashable.com/images/icons')) {
    return // Suppress this error
  }
  originalError.apply(console, args)
}

// Filter console warnings to suppress harmless CORS/resource loading warnings
console.warn = function(...args) {
  const message = String(args.join(' '))
  // Suppress specific CORS/resource loading warnings that are harmless
  if (message.includes('spritemap') || 
      message.includes('Unsafe attempt to load URL') ||
      message.includes('from frame') ||
      message.includes('Domains, protocols and ports must match') ||
      message.includes('mashable.com/images/icons')) {
    return // Suppress this warning
  }
  originalWarn.apply(console, args)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route element={<LegalRoutesLayout />}>
          <Route path="support" element={<SupportPage />} />
          <Route path="contact" element={<ContactPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
