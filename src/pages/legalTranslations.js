/** UI copy for /support and /copyright (EN + FR). */

export const legalStrings = {
  en: {
    navSupport: 'Support',
    navCopyright: 'Copyright',
    langLabel: 'Language',
    langEn: 'EN',
    langFr: 'FR',

    supportDocTitle: 'Support',
    supportH1: 'Support',
    supportIntro:
      'ActuFeed is an RSS and Atom feed reader. Add your own feed URLs, organize sources in tabs, and read headlines in one place. Opening an article uses your browser and goes to the publisher’s website.',
    supportH2Help: 'Get help',
    supportBugLabel: 'Bug reports & feature requests:',
    supportDocLabel: 'Documentation:',
    supportDocText: 'see the README in the',
    supportDocSuffix: 'project repository',
    supportFootnote:
      'For App Store or product questions, use the contact options above. We do not guarantee a response time.',

    copyrightDocTitle: 'Copyright',
    copyrightH1: 'Copyright',
    copyrightP1: '© {year} Drenlia Inc. All rights reserved.',
    copyrightP2:
      'ActuFeed (name and logo) refers to the news feed application and related materials made available by the project. Third-party names, logos, and RSS feeds belong to their respective owners.',
    copyrightH2Oss: 'Open-source software',
    copyrightOssBefore: 'The ActuFeed source code is licensed under the ',
    copyrightOssLink: 'MIT License',
    copyrightOssAfter: '. See the license file in the repository for full terms.',
  },
  fr: {
    navSupport: 'Assistance',
    navCopyright: 'Droits d’auteur',
    langLabel: 'Langue',
    langEn: 'EN',
    langFr: 'FR',

    supportDocTitle: 'Assistance',
    supportH1: 'Assistance',
    supportIntro:
      'ActuFeed est un lecteur de flux RSS et Atom. Ajoutez vos propres URL de flux, organisez vos sources par onglets et consultez les manchettes au même endroit. L’ouverture d’un article s’effectue dans le navigateur, vers le site de l’éditeur.',
    supportH2Help: 'Obtenir de l’aide',
    supportBugLabel: 'Bogues et demandes de fonctionnalités :',
    supportDocLabel: 'Documentation :',
    supportDocText: 'voir le README dans le',
    supportDocSuffix: 'dépôt du projet',
    supportFootnote:
      'Pour l’App Store ou des questions sur le produit, utilisez les options ci-dessus. Aucun délai de réponse n’est garanti.',

    copyrightDocTitle: 'Droits d’auteur',
    copyrightH1: 'Droits d’auteur',
    copyrightP1: '© {year} Drenlia Inc. Tous droits réservés.',
    copyrightP2:
      'Le nom ActuFeed (et le logo) désigne l’application de fil d’actualités et les contenus associés diffusés par le projet. Les noms, logos et flux des tiers demeurent la propriété de leurs détenteurs respectifs.',
    copyrightH2Oss: 'Logiciel libre',
    copyrightOssBefore: 'Le code source d’ActuFeed est publié sous ',
    copyrightOssLink: 'licence MIT',
    copyrightOssAfter: '. Consultez le fichier de licence dans le dépôt pour le texte complet.',
  },
}

export function t(strings, key, vars = {}) {
  let s = strings[key] ?? ''
  for (const [k, v] of Object.entries(vars)) {
    s = s.replaceAll(`{${k}}`, String(v))
  }
  return s
}
