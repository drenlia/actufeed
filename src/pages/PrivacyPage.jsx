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
        <p>{strings.privacyP3}</p>

        <h2>{strings.privacyH2Local}</h2>
        <p>{strings.privacyLocalP}</p>

        <h2>{strings.privacyH2UserContent}</h2>
        <p>{strings.privacyUserContentP1}</p>
        <p>{strings.privacyUserContentP2}</p>

        <h2>{strings.privacyH2Technical}</h2>
        <p>{strings.privacyTechnicalP}</p>

        <h2>{strings.privacyH2OpenArticles}</h2>
        <p>{strings.privacyOpenArticlesP}</p>

        <h2>{strings.privacyH2Rights}</h2>
        <p>{strings.privacyRightsP}</p>

        <h2>{strings.privacyH2Contact}</h2>
        <p>
          {strings.privacyContactBefore}
          <Link to="/support">{strings.privacyContactLinkLabel}</Link>
          {strings.privacyContactAfter}
        </p>
      </main>
    </LegalPageLayout>
  )
}
