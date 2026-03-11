import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { and, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { collaboratorTable, verificationTable } from "@/db/schema";
import { SignInFromInvite } from "@/components/sign-in-from-invite";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; email?: string; owner?: string; repo?: string; redirect?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const user = session?.user;

  const inviteToken = resolvedSearchParams.token?.trim();

  // New one-click flow: invite links carry a pre-created magic-link token.
  if (inviteToken) {
    const verification = await db.query.verificationTable.findFirst({
      where: sql`${verificationTable.identifier} = ${inviteToken}`,
    });

    if (!verification || verification.expiresAt < new Date()) {
      throw new Error("Your invite link is invalid or has expired.");
    }

    let verificationData: {
      email?: string;
      owner?: string;
      repo?: string;
      source?: string;
    } = {};

    try {
      verificationData = JSON.parse(verification.value);
    } catch {
      throw new Error("Invite data is invalid.");
    }

    const inviteEmail = verificationData.email?.trim().toLowerCase();
    const owner = verificationData.owner?.trim().toLowerCase();
    const repo = verificationData.repo?.trim().toLowerCase();
    const source = verificationData.source;

    if (!inviteEmail || !owner || !repo || source !== "collaborator-invite") {
      throw new Error("Invite data is invalid.");
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

    const baseUrl = process.env.BASE_URL
      ? process.env.BASE_URL
      : process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:3000";
    const redirectTo = resolvedSearchParams.redirect || `/${owner}/${repo}`;
    const verifyUrl = new URL("/api/auth/magic-link/verify", baseUrl);
    verifyUrl.searchParams.set("token", inviteToken);
    verifyUrl.searchParams.set("callbackURL", redirectTo);
    verifyUrl.searchParams.set(
      "errorCallbackURL",
      `/sign-in/collaborator?email=${encodeURIComponent(inviteEmail)}&owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&redirect=${encodeURIComponent(redirectTo)}`,
    );

    return (
      <SignInFromInvite
        githubUsername={user?.githubUsername ?? undefined}
        signedInEmail={user?.email ?? undefined}
        redirectTo={redirectTo}
        email={inviteEmail}
        verifyUrl={verifyUrl.toString()}
      />
    );
  }

  // Backward compatibility for old invite links
  const inviteEmail = resolvedSearchParams.email?.trim().toLowerCase();
  const owner = resolvedSearchParams.owner?.trim().toLowerCase();
  const repo = resolvedSearchParams.repo?.trim().toLowerCase();

  if (!inviteEmail || !owner || !repo) {
    throw new Error("Invalid invite link.");
  }

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
      signedInEmail={user?.email ?? undefined}
      redirectTo={resolvedSearchParams.redirect}
      email={inviteEmail}
    />
  );
}
