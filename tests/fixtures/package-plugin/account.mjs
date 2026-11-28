import { createElement } from 'react'
import { useLingui } from '@lingui/react'
export default function TranslationProof() {
  const { i18n } = useLingui()
  return createElement(
    'section',
    { 'data-package-translation': true },
    createElement('h2', null, i18n._('proof.section')),
    i18n._('proof.greeting'),
  )
}
