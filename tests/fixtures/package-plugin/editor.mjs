import { createElement } from 'react'
export default function Editor({ value }) {
  return createElement(
    'span',
    { className: 'tracking-[0.123em]', 'data-package-field': true },
    String(value ?? ''),
  )
}
