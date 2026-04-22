import { LegalPageLayout } from './LegalPageLayout.jsx'
import { useLegalLocale } from './useLegalLocale.js'

const CONTACT_EMAIL = 'info@drenlia.com'

export function ContactPage() {
  const { strings } = useLegalLocale()

  return (
    <LegalPageLayout page="contact">
      <main>
        <h1>{strings.contactH1}</h1>
        <p>{strings.contactIntro}</p>

        <div className="legal-page__contact-block">
          <p className="legal-page__org-name">{strings.contactCompany}</p>
          <p className="legal-page__address-line">{strings.contactLineStreet}</p>
          <p className="legal-page__address-line">{strings.contactLineCity}</p>
          <p className="legal-page__address-line">{strings.contactLineCountry}</p>
          <p className="legal-page__address-line legal-page__address-line--postal">
            {strings.contactLinePostal}
          </p>
          <p className="legal-page__email-line">
            <span className="legal-page__email-label">{strings.contactEmailLabel}</span>{' '}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>
        </div>
      </main>
    </LegalPageLayout>
  )
}
