import { createElement, useEffect, useState } from 'react'
export default function AccountSection() {
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  const [count, setCount] = useState(0)
  return createElement(
    'section',
    { 'data-local-plugin': true, 'data-ready': ready },
    'Local plugin settings',
    createElement(
      'button',
      { onClick: () => setCount((value) => value + 1) },
      `Plugin count: ${count}`,
    ),
  )
}
