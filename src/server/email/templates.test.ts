import { describe, expect, it } from 'vitest'

import {
  createCollaboratorAddedEmail,
  createCollaboratorInviteEmail,
  createLoginCodeEmail,
} from './templates'

const shared = {
  baseUrl: 'https://cms.example.com',
  email: 'editor@example.com',
  repoName: 'pages-cms/site',
  invitedByName: 'Ronan & Co',
  invitedByUrl: 'https://github.com/hunvreus',
}

describe('email templates', () => {
  it('uses a descriptive sign-in subject', () => {
    expect(
      createLoginCodeEmail({
        baseUrl: shared.baseUrl,
        email: shared.email,
        otp: '123456',
      }).subject,
    ).toBe('Your sign-in code is 123456')
    expect(
      createLoginCodeEmail({
        baseUrl: shared.baseUrl,
        email: shared.email,
        otp: '123456',
        locale: 'fr',
      }).subject,
    ).toBe('Votre code de connexion est 123456')
  })

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
      'Join &quot;pages-cms/site&quot;',
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

  it.each(['en', 'fr', 'es', 'pt-BR', 'zh-CN'] as const)(
    'renders every core email in %s',
    (locale) => {
      const messages = [
        createLoginCodeEmail({ ...shared, otp: '123456', locale }),
        createCollaboratorInviteEmail({
          ...shared,
          inviteUrl: 'https://cms.example.com/invite',
          locale,
        }),
        createCollaboratorAddedEmail({
          ...shared,
          repoUrl: 'https://cms.example.com/repo',
          locale,
        }),
      ]
      for (const message of messages) {
        expect(message.html).toContain(`<html lang="${locale}">`)
        expect(message.html).toContain('editor@example.com')
        expect(message.text).toContain('editor@example.com')
      }
      for (const message of messages.slice(1)) {
        expect(message.subject).not.toContain('Pages CMS')
        expect(message.subject).toContain(shared.repoName)
        expect(message.html).toMatch(/<h1[^>]*>[^<]*pages-cms\/site[^<]*<\/h1>/)
      }
      if (locale !== 'en')
        expect(messages[0].subject).not.toBe('Your sign-in code is 123456')
    },
  )
})
