import { describe, expect, it } from 'vitest'

import {
  createCollaboratorAddedEmail,
  createCollaboratorInviteEmail,
  createLoginCodeEmail,
} from './email-templates.server'

const shared = {
  baseUrl: 'https://cms.example.com',
  email: 'editor@example.com',
  repoName: 'pages-cms/site',
  invitedByName: 'Ronan & Co',
  invitedByUrl: 'https://github.com/hunvreus',
}

describe('email templates', () => {
  it.each([
    [
      'sign-in',
      createLoginCodeEmail({
        baseUrl: shared.baseUrl,
        email: shared.email,
        otp: '123456',
      }),
      'Sign in to Pages CMS',
    ],
    [
      'collaborator invitation',
      createCollaboratorInviteEmail({
        ...shared,
        inviteUrl: 'https://cms.example.com/invite/token',
      }),
      'Join &quot;pages-cms/site&quot; on Pages CMS',
    ],
    [
      'existing collaborator notification',
      createCollaboratorAddedEmail({
        ...shared,
        repoUrl: 'https://cms.example.com/pages-cms/site',
      }),
      'You were added to &quot;pages-cms/site&quot;',
    ],
  ])('renders the branded %s email', (_name, message, heading) => {
    expect(message.text).toBeTruthy()
    expect(message.html).toContain('<!doctype html>')
    expect(message.html).toContain(
      'https://cms.example.com/images/email-logo.png',
    )
    expect(message.html).toContain(heading)
    expect(message.html).toContain('editor@example.com')
    expect(message.html).not.toContain('Ronan & Co')
  })

  it('escapes collaborator content and preserves safe destination URLs', () => {
    const message = createCollaboratorInviteEmail({
      ...shared,
      repoName: '<script>alert(1)</script>',
      inviteUrl: 'https://cms.example.com/invite/safe-token',
    })

    expect(message.html).not.toContain('<script>')
    expect(message.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(message.html).toContain(
      'href="https://cms.example.com/invite/safe-token"',
    )
  })
})
