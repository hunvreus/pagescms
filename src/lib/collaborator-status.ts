export function collaboratorStatus(
  active: boolean,
  expiresAt?: Date | string | null,
  now = Date.now(),
) {
  if (active) return 'Active'
  if (expiresAt && new Date(expiresAt).getTime() <= now)
    return 'Invitation expired'
  return 'Invitation pending'
}
