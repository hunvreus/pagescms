const authenticationErrorMessages: Record<string, string> = {
  email_not_verified:
    'Your sign-in provider did not confirm a verified email address. Verify your email with that provider and try again.',
  internal_server_error:
    'Sign-in could not be completed. Please try again in a moment.',
  unable_to_get_user_info:
    'Could not retrieve your GitHub profile. Check the app permissions and try again.',
}

export function getAuthenticationErrorMessage(error?: string) {
  if (!error) return 'An unexpected authentication error occurred.'
  return Object.hasOwn(authenticationErrorMessages, error)
    ? authenticationErrorMessages[error]
    : 'Sign-in could not be completed.'
}
