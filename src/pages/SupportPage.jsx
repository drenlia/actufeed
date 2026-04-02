import { LegalPageLayout } from './LegalPageLayout.jsx'
import { useLegalLocale } from './LegalLocaleContext.jsx'

const GITHUB_ISSUES = 'https://github.com/drenlia/actufeed/issues'
const REPO = 'https://github.com/drenlia/actufeed'

export function SupportPage() {
  const { strings } = useLegalLocale()

  return (
    <LegalPageLayout page="support">
      <main>
        <h1>{strings.supportH1}</h1>
        <p>{strings.supportIntro}</p>

        <h2>{strings.supportH2Help}</h2>
        <ul>
          <li>
            <strong>{strings.supportBugLabel}</strong>{' '}
            <a href={GITHUB_ISSUES} target="_blank" rel="noopener noreferrer">
              GitHub Issues
            </a>{' '}
            ({REPO})
          </li>
          <li>
            <strong>{strings.supportDocLabel}</strong>{' '}
            {strings.supportDocText}{' '}
            <a href={REPO} target="_blank" rel="noopener noreferrer">
              {strings.supportDocSuffix}
            </a>
            .
          </li>
        </ul>

        <p className="legal-page__muted">{strings.supportFootnote}</p>
      </main>
    </LegalPageLayout>
  )
}
