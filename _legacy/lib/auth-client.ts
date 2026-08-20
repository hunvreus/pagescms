import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

const authClient = createAuthClient({
  plugins: [emailOTPClient()],
});

export const { emailOtp, signIn, signOut, useSession } = authClient;
export { authClient };
