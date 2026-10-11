import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ActionRunStatus } from './action-run-status'

describe('action run status', () => {
  it.each([
    ['queued', 'Queued'],
    ['in_progress', 'In progress'],
    ['timed_out', 'Timed out'],
    ['action_required', 'Action required'],
    ['future_status', 'Unknown'],
  ])('labels %s for display', (status, label) => {
    const html = renderToStaticMarkup(<ActionRunStatus status={status} />)
    expect(html).toContain(`</svg>${label}`)
    expect(html.includes('animate-spin')).toBe(status === 'in_progress')
  })
  it('shows the conclusion instead of Completed and uses semantic failure styling', () => {
    const failure = renderToStaticMarkup(
      <ActionRunStatus status="completed" conclusion="failure" />,
    )
    expect(failure).toContain('data-variant="destructive"')
    expect(failure).toContain('</svg>Failure')
    const success = renderToStaticMarkup(
      <ActionRunStatus status="completed" conclusion="success" />,
    )
    expect(success).toContain('</svg>Success')
    expect(success).not.toContain('text-green')
    expect(success).toContain('data-variant="secondary"')
  })
})
