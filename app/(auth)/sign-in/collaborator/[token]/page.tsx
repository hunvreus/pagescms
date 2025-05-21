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
  const redirectPage = user ? '/' : '/sign-in';
  if (!params.token) {
    const error = 'Your sign in link is invalid (token is missing).';
    redirect(`${redirectPage}?error=${encodeURIComponent(error)}&redirect=${searchParams.redirect}`);
  }
  
  if (user && !user.githubId) {
    redirect(searchParams.redirect || '/');
  }

  let tokenHash, emailLoginToken;
  try {
    ({ tokenHash, emailLoginToken } = await getTokenData(params.token));
  } catch (error: any) {
    redirect(`${redirectPage}?error=${encodeURIComponent(error.message)}&redirect=${searchParams.redirect}`);
  }

  return <SignInFromInvite token={params.token} githubUsername={user?.githubUsername} redirectTo={searchParams.redirect} email={emailLoginToken.email} />;
}