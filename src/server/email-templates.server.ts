import type { EmailMessage } from './email.server'

const theme = {
  background: '#ffffff',
  foreground: '#0a0a0a',
  muted: '#f5f5f5',
  mutedForeground: '#737373',
  link: '#0a0a0a',
  buttonBackground: '#009869',
  buttonForeground: '#edfdf5',
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
}: {
  baseUrl: string
  preview: string
  heading: string
  content: string
}) {
  const logoUrl = new URL('/images/email-logo.png', baseUrl).toString()
  return `<!doctype html>
<html lang="en">
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
                <h1 style="margin:30px 0;padding:0;color:${theme.foreground};font-size:24px;font-weight:600;line-height:32px;letter-spacing:-0.025em;text-align:center">${escapeHtml(heading)}</h1>
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
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto"><tr><td align="center" bgcolor="${theme.buttonBackground}" style="border-radius:8px"><a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 20px;color:${theme.buttonForeground};font-size:14px;font-weight:500;line-height:20px;text-decoration:none">${escapeHtml(label)}</a></td></tr></table>`
}

function recipient(email: string, suffix: string) {
  return paragraph(
    `This email was intended for ${link(`mailto:${email}`, email, true)}. ${escapeHtml(suffix)}`,
    true,
  )
}

export function createLoginCodeEmail({
  baseUrl,
  email,
  otp,
}: {
  baseUrl: string
  email: string
  otp: string
}): EmailMessage {
  const subject = `Your Pages CMS temporary code is ${otp}`
  const html = document({
    baseUrl,
    preview: subject,
    heading: 'Sign in to Pages CMS',
    content: [
      paragraph('Enter this temporary verification code to continue:'),
      `<div style="margin:24px 0;text-align:center"><code style="display:inline-block;margin:0;padding:12px 4px 12px 12px;border-radius:8px;background:${theme.muted};color:${theme.foreground};font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;font-size:28px;font-weight:500;letter-spacing:8px;line-height:1">${escapeHtml(otp)}</code></div>`,
      paragraph('This code will expire in 5 minutes.'),
      recipient(
        email,
        "If you didn't try to sign in, you can safely ignore this email.",
      ),
    ].join(''),
  })
  return {
    to: email,
    subject,
    text: `Enter this temporary verification code to sign in to Pages CMS: ${otp}\n\nThis code will expire in 5 minutes.\n\nThis email was intended for ${email}. If you didn't try to sign in, you can safely ignore this email.`,
    html,
  }
}

type CollaboratorEmailInput = {
  baseUrl: string
  email: string
  repoName: string
  invitedByName: string
  invitedByUrl: string
}

export function createCollaboratorInviteEmail({
  baseUrl,
  email,
  repoName,
  inviteUrl,
  invitedByName,
  invitedByUrl,
}: CollaboratorEmailInput & { inviteUrl: string }): EmailMessage {
  const subject = `Join "${repoName}" on Pages CMS`
  const html = document({
    baseUrl,
    preview: `${invitedByName} invited you to "${repoName}"`,
    heading: `Join "${repoName}" on Pages CMS`,
    content: [
      paragraph(
        `${link(invitedByUrl, invitedByName)} has invited you to the &quot;${escapeHtml(repoName)}&quot; project on Pages CMS. Use the following link to start collaborating:`,
      ),
      button(inviteUrl, `Join "${repoName}"`),
      paragraph('or copy and paste this URL into your browser:'),
      paragraph(link(inviteUrl, inviteUrl)),
      recipient(
        email,
        'If you think this is a mistake, you can safely ignore this email.',
      ),
    ].join(''),
  })
  return {
    to: email,
    subject,
    text: `${invitedByName} invited you to the "${repoName}" project on Pages CMS.\n\nJoin "${repoName}": ${inviteUrl}\n\nThis email was intended for ${email}. If you think this is a mistake, you can safely ignore this email.`,
    html,
  }
}

export function createCollaboratorAddedEmail({
  baseUrl,
  email,
  repoName,
  repoUrl,
  invitedByName,
  invitedByUrl,
}: CollaboratorEmailInput & { repoUrl: string }): EmailMessage {
  const subject = `You were added to "${repoName}" on Pages CMS`
  const html = document({
    baseUrl,
    preview: subject,
    heading: `You were added to "${repoName}"`,
    content: [
      paragraph(
        `${link(invitedByUrl, invitedByName)} added you to the &quot;${escapeHtml(repoName)}&quot; project on Pages CMS. You already have access, so there is nothing to accept.`,
      ),
      button(repoUrl, `Open "${repoName}"`),
      recipient(email, ''),
    ].join(''),
  })
  return {
    to: email,
    subject,
    text: `${invitedByName} added you to the "${repoName}" project on Pages CMS. You already have access, so there is nothing to accept.\n\nOpen "${repoName}": ${repoUrl}\n\nThis email was intended for ${email}.`,
    html,
  }
}
