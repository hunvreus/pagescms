import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { getAccounts } from "@/lib/utils/accounts";
import { Providers } from "@/components/providers";

export default async function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { session, user } = await getAuth();
  if (!session) return redirect("/sign-in");

  const accounts = await getAccounts(user);
  const userWithAccounts = { ...user, accounts };
  
	return (
    <Providers user={userWithAccounts}>
      {children}
    </Providers>
  );
}