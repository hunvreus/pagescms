/** Stable identity shared by pending invitations and accepted collaborators. */
export function collaboratorKey(email: string) {
  return `collaborator:${email.trim().toLowerCase()}`
}
