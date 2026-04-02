import { Outlet } from 'react-router-dom'
import { LegalLocaleProvider } from './LegalLocaleProvider.jsx'

export function LegalRoutesLayout() {
  return (
    <LegalLocaleProvider>
      <Outlet />
    </LegalLocaleProvider>
  )
}
