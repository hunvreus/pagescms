import { redirect } from "next/navigation";
import { getAccounts } from "@/lib/utils/accounts";
import { UserProvider } from "@/contexts/user-context";
import { User } from "@/types/user";
import { getServerSession } from "@/lib/session-server";

export default async function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession();
  if (!session?.user) return redirect("/sign-in");

  const accounts = await getAccounts(session.user as User);
  const userWithAccounts = { ...session.user, accounts };
  
	return (
    <UserProvider user={userWithAccounts}>
      {children}
    </UserProvider>
  );
}
