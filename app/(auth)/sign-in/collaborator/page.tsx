import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { and, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { collaboratorTable } from "@/db/schema";
import { SignInFromInvite } from "@/components/sign-in-from-invite";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; owner?: string; repo?: string; redirect?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const inviteEmail = resolvedSearchParams.email?.trim().toLowerCase();
  const owner = resolvedSearchParams.owner?.trim().toLowerCase();
  const repo = resolvedSearchParams.repo?.trim().toLowerCase();

  if (!inviteEmail || !owner || !repo) {
    throw new Error("Invalid invite link.");
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const user = session?.user;

  if (user && !user.githubUsername) {
    redirect(resolvedSearchParams.redirect || "/");
  }

  const invite = await db.query.collaboratorTable.findFirst({
    where: and(
      sql`lower(${collaboratorTable.email}) = ${inviteEmail}`,
      sql`lower(${collaboratorTable.owner}) = ${owner}`,
      sql`lower(${collaboratorTable.repo}) = ${repo}`
    ),
  });

  if (!invite) {
    throw new Error("Your invite is invalid or has been removed.");
  }

  return (
    <SignInFromInvite
      githubUsername={user?.githubUsername ?? undefined}
      redirectTo={resolvedSearchParams.redirect}
      email={inviteEmail}
    />
  );
}
