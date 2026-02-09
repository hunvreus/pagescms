import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getTokenData } from "@/lib/actions/auth";
import { SignInFromInvite } from "@/components/sign-in-from-invite";

export default async function Page({ 
  params,
  searchParams 
}: { 
  params: Promise<{ token: string }>,
  searchParams: Promise<{ redirect?: string }>
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const { user } = await getAuth();
  
  if (!resolvedParams.token) {
    throw new Error("Your sign in link is invalid (token is missing).");
  }
  
  if (user && !user.githubId) {
    redirect(resolvedSearchParams.redirect || '/');
  }

  const { tokenHash, emailLoginToken } = await getTokenData(resolvedParams.token);

  return (
    <SignInFromInvite
      token={resolvedParams.token}
      githubUsername={user?.githubUsername}
      redirectTo={resolvedSearchParams.redirect}
      email={emailLoginToken.email}
    />
  );
}
