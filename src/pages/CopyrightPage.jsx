import { LegalPageLayout } from './LegalPageLayout.jsx'
import { useLegalLocale } from './LegalLocaleContext.jsx'
import { t } from './legalTranslations.js'

const GITHUB_LICENSE = 'https://github.com/drenlia/actufeed/blob/main/LICENSE'

export function CopyrightPage() {
  const { strings } = useLegalLocale()
  const year = new Date().getFullYear()

  return (
    <LegalPageLayout page="copyright">
      <main>
        <h1>{strings.copyrightH1}</h1>
        <p>{t(strings, 'copyrightP1', { year })}</p>
        <p>{strings.copyrightP2}</p>

        <h2>{strings.copyrightH2Oss}</h2>
        <p>
          {strings.copyrightOssBefore}
          <a href={GITHUB_LICENSE} target="_blank" rel="noopener noreferrer">
            {strings.copyrightOssLink}
          </a>
          {strings.copyrightOssAfter}
        </p>
      </main>
    </LegalPageLayout>
  )
}
