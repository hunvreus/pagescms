const authenticationErrorMessages: Record<string, string> = {
  internal_server_error:
    'Sign-in could not be completed. Please try again in a moment.',
  unable_to_get_user_info:
    'Pages CMS could not retrieve your GitHub profile. Please check the app permissions and try again.',
}

export function getAuthenticationErrorMessage(error?: string) {
  if (!error) return 'An unexpected authentication error occurred.'
  return authenticationErrorMessages[error] ?? 'Sign-in could not be completed.'
}
