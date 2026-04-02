import { Link } from 'react-router-dom'
import { LegalPageLayout } from './LegalPageLayout.jsx'
import { useLegalLocale } from './useLegalLocale.js'

export function PrivacyPage() {
  const { strings } = useLegalLocale()

  return (
    <LegalPageLayout page="privacy">
      <main>
        <h1>{strings.privacyH1}</h1>
        <p className="legal-page__last-updated">{strings.privacyLastUpdated}</p>

        <p>{strings.privacyP1}</p>
        <p>{strings.privacyP2}</p>

        <h2>{strings.privacyH2Local}</h2>
        <p>{strings.privacyLocalP}</p>

        <h2>{strings.privacyH2Server}</h2>
        <p>{strings.privacyServerP}</p>

        <h2>{strings.privacyH2ThirdParty}</h2>
        <p>{strings.privacyThirdPartyP}</p>

        <h2>{strings.privacyH2Contact}</h2>
        <p>
          {strings.privacyContactBefore}{' '}
          <Link to="/support">{strings.navSupport}</Link>
          {strings.privacyContactAfter}
        </p>
      </main>
    </LegalPageLayout>
  )
}
