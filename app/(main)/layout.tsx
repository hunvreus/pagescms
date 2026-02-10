import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getAccounts } from "@/lib/utils/accounts";
import { Providers } from "@/components/providers";
import { User } from "@/types/user";

export default async function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user) return redirect("/sign-in");

  const accounts = await getAccounts(session.user as User);
  const userWithAccounts = { ...session.user, accounts };
  
	return (
    <Providers user={userWithAccounts}>
      {children}
    </Providers>
  );
}
