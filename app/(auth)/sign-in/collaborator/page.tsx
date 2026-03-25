import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { and, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { collaboratorTable, verificationTable } from "@/db/schema";
import { SignInFromInvite } from "@/components/sign-in-from-invite";
import { hasGithubIdentity } from "@/lib/authz";
import { getBaseUrl } from "@/lib/base-url";
import { buttonVariants } from "@/components/ui/button";

const getSafeRedirect = (redirectTo?: string) => {
  if (!redirectTo) return "/";
  return redirectTo.startsWith("/") && !redirectTo.startsWith("//")
    ? redirectTo
    : "/";
};

const InviteUnavailable = ({
  message = "This invite link is no longer valid. It may have already been used, expired, or been removed.",
}: {
  message?: string;
}) => {
  return (
    <div className="min-h-screen p-4 md:p-6 flex justify-center items-center">
      <div className="sm:max-w-[340px] w-full space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-lg font-medium tracking-tight">
            Invite unavailable
          </h1>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        <div className="flex flex-col gap-y-2">
          <Link href="/sign-in" className={buttonVariants()}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    token?: string;
    email?: string;
    owner?: string;
    repo?: string;
    redirect?: string;
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const user = session?.user;
  const isGithubUser = hasGithubIdentity(user);

  const inviteToken = resolvedSearchParams.token?.trim();

  // One-click flow: invite links carry a pre-created magic-link token.
  if (inviteToken) {
    const verification = await db.query.verificationTable.findFirst({
      where: sql`${verificationTable.identifier} = ${inviteToken}`,
    });

    if (!verification || verification.expiresAt < new Date()) {
      return <InviteUnavailable message="This invite link has expired or is no longer valid." />;
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
      return <InviteUnavailable />;
    }

    const inviteEmail = verificationData.email?.trim().toLowerCase();
    const owner = verificationData.owner?.trim().toLowerCase();
    const repo = verificationData.repo?.trim().toLowerCase();
    const source = verificationData.source;

    if (!inviteEmail || !owner || !repo || source !== "collaborator-invite") {
      return <InviteUnavailable />;
    }

    const invite = await db.query.collaboratorTable.findFirst({
      where: and(
        sql`lower(${collaboratorTable.email}) = ${inviteEmail}`,
        sql`lower(${collaboratorTable.owner}) = ${owner}`,
        sql`lower(${collaboratorTable.repo}) = ${repo}`,
      ),
    });

    if (!invite) {
      return <InviteUnavailable message="This invitation is no longer available. Ask the repository owner to send you a new invite if you still need access." />;
    }

    const baseUrl = getBaseUrl();
    const redirectTo = getSafeRedirect(
      resolvedSearchParams.redirect || `/${owner}/${repo}`,
    );
    const verifyUrl = new URL("/api/auth/magic-link/verify", baseUrl);
    verifyUrl.searchParams.set("token", inviteToken);
    verifyUrl.searchParams.set("callbackURL", redirectTo);
    verifyUrl.searchParams.set(
      "errorCallbackURL",
      `/sign-in/collaborator?email=${encodeURIComponent(inviteEmail)}&owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&redirect=${encodeURIComponent(redirectTo)}`,
    );

    return (
      <SignInFromInvite
        githubUsername={
          isGithubUser ? (user?.githubUsername ?? undefined) : undefined
        }
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
    return <InviteUnavailable message="This invite link is invalid." />;
  }

  if (user && !isGithubUser) {
    redirect(getSafeRedirect(resolvedSearchParams.redirect));
  }

  const invite = await db.query.collaboratorTable.findFirst({
    where: and(
      sql`lower(${collaboratorTable.email}) = ${inviteEmail}`,
      sql`lower(${collaboratorTable.owner}) = ${owner}`,
      sql`lower(${collaboratorTable.repo}) = ${repo}`,
    ),
  });

  if (!invite) {
    return <InviteUnavailable message="This invitation is no longer available. Ask the repository owner to send you a new invite if you still need access." />;
  }

  return (
    <SignInFromInvite
      githubUsername={
        isGithubUser ? (user?.githubUsername ?? undefined) : undefined
      }
      signedInEmail={user?.email ?? undefined}
      redirectTo={getSafeRedirect(resolvedSearchParams.redirect)}
      email={inviteEmail}
    />
  );
}
