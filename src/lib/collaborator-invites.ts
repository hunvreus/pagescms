export function splitCollaboratorRecipients(text: string): string[] {
  // Keep mailbox display names together, including quoted names with commas.
  const pattern =
    /"(?:[^"\\]|\\.)*"\s*<[^<>]*>|[^@<>,;\r\n"]+<[^<>]*>|[^\s,;]+/y
  const recipients: string[] = []
  let index = 0
  while (index < text.length) {
    if (/[\s,;]/.test(text[index])) {
      index++
      continue
    }
    pattern.lastIndex = index
    const match = pattern.exec(text)
    if (!match) {
      recipients.push(text.slice(index))
      break
    }
    recipients.push(match[0].trim())
    index = pattern.lastIndex
  }
  return recipients
}

export function collaboratorEmail(recipient: string): string | undefined {
  const mailbox = recipient.match(
    /^(?:"(?:[^"\\]|\\.)*"|[^@<>,;"]+)\s*<\s*([^<>\s]+)\s*>$/,
  )
  const email = (mailbox?.[1] ?? recipient).trim().toLowerCase()
  return /^[^\s@<>"(),;:]+@[^\s@<>"(),;:]+\.[^\s@<>"(),;:]+$/.test(email)
    ? email
    : undefined
}

export function parseCollaboratorEmails(text: string): string[] {
  const emails = splitCollaboratorRecipients(text).map((recipient) => {
    const email = collaboratorEmail(recipient)
    if (!email) throw new Error('Enter a valid email address for each person')
    return email
  })
  if (!emails.length) throw new Error('Enter at least one email address')
  return [...new Set(emails)]
}

export function collaboratorInviteFieldError(
  error: unknown,
): string | undefined {
  if (!(error instanceof Error)) return
  if (
    error.message === 'Enter at least one email address' ||
    error.message === 'Enter a valid email address for each person' ||
    error.message.endsWith(' is already a collaborator')
  )
    return error.message
}
