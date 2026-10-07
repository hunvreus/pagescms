export function isDeploymentAdmin(
  user: { email: string; emailVerified?: boolean },
  adminEmails: readonly string[],
) {
  return (
    user.emailVerified === true &&
    adminEmails.includes(user.email.toLowerCase())
  )
}
