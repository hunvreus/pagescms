export default () => ({
  pages: {
    translations: {
      path: '/proof/translation',
      title: { id: 'proof.section', message: 'Package translations' },
      load: () => import('./account.mjs'),
    },
  },
  translations: {
    en: () => import('./locales/en.mjs'),
    fr: () => import('./locales/fr.mjs'),
  },
  ui: {
    accountSettings: [
      {
        id: 'package-translations',
        label: { id: 'proof.section', message: 'Package translations' },
        load: () => import('./account.mjs'),
      },
    ],
  },
  fields: {
    proof: {
      editor: () => import('./editor.mjs'),
      view: () => import('./editor.mjs'),
    },
  },
})
