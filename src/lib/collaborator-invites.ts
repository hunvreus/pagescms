export function parseCollaboratorEmails(text: string): string[] {
  const emails = text
    .trim()
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((email) => email.toLowerCase())
  if (!emails.length) throw new Error('Enter at least one email address')
  if (emails.some((email) => !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)))
    throw new Error('Enter a valid email address for each person')
  return [...new Set(emails)]
}
