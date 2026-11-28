import type { Locale } from '#/i18n/locale'
import type { EmailMessage } from './email'
import { emailText } from './translations'

const theme = {
  background: '#ffffff',
  foreground: '#0a0a0a',
  muted: '#f5f5f5',
  mutedForeground: '#737373',
  link: '#0a0a0a',
  buttonBackground: '#171717',
  buttonForeground: '#fafafa',
} as const

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function document({
  baseUrl,
  preview,
  heading,
  content,
  locale = 'en',
}: {
  baseUrl: string
  preview: string
  heading: string
  content: string
  locale?: Locale
}) {
  const logoUrl = new URL('/images/email-logo.png', baseUrl).toString()
  return `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(preview)}</title>
  </head>
  <body style="margin:0;background:${theme.background};color:${theme.foreground};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;-webkit-font-smoothing:antialiased">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preview)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${theme.background}">
      <tr>
        <td align="center" style="padding:40px 20px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:465px">
            <tr>
              <td align="center" style="padding:24px 0 0">
                <img src="${escapeHtml(logoUrl)}" width="42" height="42" alt="Pages CMS" style="display:block;border:0">
              </td>
            </tr>
            <tr>
              <td>
                <h1 style="margin:30px 0;padding:0;color:${theme.foreground};font-size:24px;font-weight:500;line-height:32px;letter-spacing:-0.025em;text-align:center">${escapeHtml(heading)}</h1>
                ${content}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function paragraph(content: string, muted = false) {
  return `<p style="margin:16px 0;color:${muted ? theme.mutedForeground : theme.foreground};font-size:${muted ? '14px' : '16px'};line-height:24px">${content}</p>`
}

function link(href: string, label: string, muted = false) {
  return `<a href="${escapeHtml(href)}" style="color:${muted ? theme.mutedForeground : theme.link};text-decoration:underline">${escapeHtml(label)}</a>`
}

function button(href: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto"><tr><td align="center" bgcolor="${theme.buttonBackground}" style="border-radius:8px"><a href="${escapeHtml(href)}" style="display:inline-block;padding:8px 12px;color:${theme.buttonForeground};font-size:14px;font-weight:500;line-height:20px;text-decoration:none">${escapeHtml(label)}</a></td></tr></table>`
}

function recipient(
  email: string,
  locale: Locale,
  notice: 'ignore' | 'contact',
) {
  const copy = emailText[locale]
  return paragraph(
    `${escapeHtml(copy.recipient)} ${link(`mailto:${email}`, email, true)}. ${escapeHtml(copy[notice])}`,
    true,
  )
}

export function createLoginCodeEmail({
  baseUrl,
  email,
  otp,
  locale = 'en',
}: {
  baseUrl: string
  email: string
  otp: string
  locale?: Locale
}): EmailMessage {
  const copy = emailText[locale]
  const subject = copy.signSubject(otp)
  return {
    to: email,
    subject,
    text: `${copy.signInstruction} ${otp}\n\n${copy.expiry}\n\n${copy.recipient} ${email}. ${copy.ignore}`,
    html: document({
      baseUrl,
      locale,
      preview: subject,
      heading: copy.signHeading,
      content: [
        paragraph(escapeHtml(copy.signInstruction)),
        `<div style="margin:24px 0;text-align:center"><code style="display:inline-block;margin:0;padding:10px 6px 10px 10px;border-radius:8px;background:${theme.muted};color:${theme.foreground};font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;font-size:20px;font-weight:500;letter-spacing:4px;line-height:1">${escapeHtml(otp)}</code></div>`,
        paragraph(escapeHtml(copy.expiry)),
        recipient(email, locale, 'ignore'),
      ].join(''),
    }),
  }
}

type CollaboratorEmailInput = {
  baseUrl: string
  email: string
  repoName: string
  invitedByName: string
  invitedByUrl: string
  locale?: Locale
}

function collaboratorEmail(
  input: CollaboratorEmailInput & { url: string },
  kind: 'invite' | 'added',
): EmailMessage {
  const {
    baseUrl,
    email,
    repoName,
    invitedByName,
    invitedByUrl,
    url,
    locale = 'en',
  } = input
  const copy = emailText[locale]
  const invite = kind === 'invite'
  const subject = invite
    ? copy.inviteSubject(repoName)
    : copy.addedSubject(repoName)
  const heading = invite ? subject : copy.addedHeading(repoName)
  const label = invite ? copy.join(repoName) : copy.open(repoName)
  const body = invite
    ? copy.inviteBody(invitedByName, repoName)
    : copy.addedBody(invitedByName, repoName)
  const htmlBody = escapeHtml(
    invite
      ? copy.inviteBody('%%PERSON%%', repoName)
      : copy.addedBody('%%PERSON%%', repoName),
  ).replace('%%PERSON%%', link(invitedByUrl, invitedByName))
  const notice = invite ? 'ignore' : 'contact'
  return {
    to: email,
    subject,
    text: `${body}\n\n${label}: ${url}\n\n${copy.recipient} ${email}. ${copy[notice]}`,
    html: document({
      baseUrl,
      locale,
      preview: subject,
      heading,
      content: [
        paragraph(htmlBody),
        button(url, label),
        paragraph(escapeHtml(copy.copy)),
        paragraph(link(url, url)),
        recipient(email, locale, notice),
      ].join(''),
    }),
  }
}

export function createCollaboratorInviteEmail(
  input: CollaboratorEmailInput & { inviteUrl: string },
): EmailMessage {
  return collaboratorEmail({ ...input, url: input.inviteUrl }, 'invite')
}

export function createCollaboratorAddedEmail(
  input: CollaboratorEmailInput & { repoUrl: string },
): EmailMessage {
  return collaboratorEmail({ ...input, url: input.repoUrl }, 'added')
}

/** Branded transactional message for extensions, with escaped text and a plain-text fallback. */
export function createNotificationEmail({
  baseUrl,
  email,
  subject,
  heading,
  paragraphs,
  action,
  locale = 'en',
}: {
  baseUrl: string
  email: string
  subject: string
  heading: string
  paragraphs: readonly string[]
  action: { label: string; url: string }
  locale?: Locale
}): EmailMessage {
  const copy = emailText[locale]
  return {
    to: email,
    subject,
    text: `${paragraphs.join('\n\n')}\n\n${action.label}: ${action.url}\n\n${copy.recipient} ${email}. ${copy.contact}`,
    html: document({
      baseUrl,
      locale,
      preview: subject,
      heading,
      content: [
        ...paragraphs.map((text) => paragraph(escapeHtml(text))),
        button(action.url, action.label),
        paragraph(escapeHtml(copy.copy)),
        paragraph(link(action.url, action.url)),
        recipient(email, locale, 'contact'),
      ].join(''),
    }),
  }
}
