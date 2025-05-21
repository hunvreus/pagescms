import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getTokenData } from "@/lib/actions/auth";
import { SignInFromInvite } from "@/components/sign-in-from-invite";

export default async function Page({ 
  params,
  searchParams 
}: { 
  params: { token: string },
  searchParams: { redirect?: string }
}) {
  const { user } = await getAuth();
  
  if (!params.token) {
    throw new Error("Your sign in link is invalid (token is missing).");
  }
  
  if (user && !user.githubId) {
    redirect(searchParams.redirect || '/');
  }

  const { tokenHash, emailLoginToken } = await getTokenData(params.token);

  return (
    <SignInFromInvite
      token={params.token}
      githubUsername={user?.githubUsername}
      redirectTo={searchParams.redirect}
      email={emailLoginToken.email}
    />
  );
}