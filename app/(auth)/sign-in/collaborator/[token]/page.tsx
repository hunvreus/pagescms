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
  if (!params.token) {
    const error = "Your sign in link is invalid (token is missing).";
    redirect(`/sign-in?error=${encodeURIComponent(error)}`);
  }

  const { user } = await getAuth();
  
  if (user && !user.githubId) {
    if (searchParams.redirect) {
      redirect(searchParams.redirect);
    } else {
      redirect("/");
    }
  }

  let tokenHash, emailLoginToken;
  try {
    ({ tokenHash, emailLoginToken } = await getTokenData(params.token));
  } catch (error: any) {
    redirect(`/sign-in?error=${encodeURIComponent(error.message)}`);
  }

  return <SignInFromInvite token={params.token} githubUsername={user?.githubUsername} redirectTo={searchParams.redirect} email={emailLoginToken.email} />;
}