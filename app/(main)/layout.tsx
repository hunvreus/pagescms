import { redirect } from "next/navigation";
import { getAccounts } from "@/lib/utils/accounts";
import { UserProvider } from "@/contexts/user-context";
import { User } from "@/types/user";
import { getServerSession } from "@/lib/session-server";
import { GithubAuthExpired } from "@/components/github-auth-expired";
import { isGithubAuthError } from "@/lib/github-auth";

export default async function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession();
  if (!session?.user) return redirect("/sign-in");

  let accounts;
  try {
    accounts = await getAccounts(session.user as User);
  } catch (error) {
    if (isGithubAuthError(error)) {
      return <GithubAuthExpired />;
    }
    throw error;
  }

  const userWithAccounts = { ...session.user, accounts };
  
	return (
    <UserProvider user={userWithAccounts}>
      {children}
    </UserProvider>
  );
}
