import { emailOTPClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  plugins: [emailOTPClient()],
})

export const { emailOtp, signIn, signOut, useSession } = authClient
