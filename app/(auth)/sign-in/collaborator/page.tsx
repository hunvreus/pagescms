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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

const getSafeRedirect = (redirectTo?: string) => {
  if (!redirectTo) return "/";
  return redirectTo.startsWith("/") && !redirectTo.startsWith("//")
    ? redirectTo
    : "/";
};

const isInviteEmailMatch = (signedInEmail?: string, inviteEmail?: string) => {
  if (!signedInEmail || !inviteEmail) return false;
  return signedInEmail.trim().toLowerCase() === inviteEmail.trim().toLowerCase();
};

const getWrongAccountInviteMessage = (
  currentEmail?: string,
  inviteEmail?: string,
) => {
  if (currentEmail && inviteEmail) {
    return `This invitation is not valid for your current account (${currentEmail}). Sign in as ${inviteEmail} or ask for a new invitation.`;
  }

  return "This invitation is not valid for your current account. Sign in with the invited email or ask for a new invitation.";
};

const InviteUnavailable = ({
  title = "Invite unavailable",
  message = "This invitation is no longer available. It may have expired, already been used, or been removed.",
  redirectTo = "/",
}: {
  title?: string;
  message?: string;
  redirectTo?: string;
}) => {
  const signInHref =
    redirectTo && redirectTo !== "/"
      ? `/sign-in?redirect=${encodeURIComponent(redirectTo)}`
      : "/sign-in";

  return (
    <Empty className="absolute inset-0 border-0 rounded-none">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
          <Link href={signInHref} className={buttonVariants()}>
            Sign in
          </Link>
      </EmptyContent>
    </Empty>
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
  const fallbackInviteEmail = resolvedSearchParams.email?.trim().toLowerCase();
  const fallbackOwner = resolvedSearchParams.owner?.trim().toLowerCase();
  const fallbackRepo = resolvedSearchParams.repo?.trim().toLowerCase();
  const fallbackRedirect = getSafeRedirect(
    resolvedSearchParams.redirect || (
      fallbackOwner && fallbackRepo ? `/${fallbackOwner}/${fallbackRepo}` : "/"
    ),
  );
  const wrongAccountMessage = getWrongAccountInviteMessage(
    user?.email ?? undefined,
    fallbackInviteEmail,
  );

  const inviteToken = resolvedSearchParams.token?.trim();

  // One-click flow: invite links carry a pre-created magic-link token.
  if (inviteToken) {
    const verification = await db.query.verificationTable.findFirst({
      where: sql`${verificationTable.identifier} = ${inviteToken}`,
    });

    if (!verification || verification.expiresAt < new Date()) {
      if (isInviteEmailMatch(user?.email ?? undefined, fallbackInviteEmail)) {
        redirect(fallbackRedirect);
      }
      return <InviteUnavailable title={user?.email ? "Wrong account" : undefined} message={user?.email ? wrongAccountMessage : "This invitation has expired or is no longer valid."} redirectTo={fallbackRedirect} />;
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
      if (isInviteEmailMatch(user?.email ?? undefined, fallbackInviteEmail)) {
        redirect(fallbackRedirect);
      }
      return <InviteUnavailable title={user?.email ? "Wrong account" : undefined} message={user?.email ? wrongAccountMessage : undefined} redirectTo={fallbackRedirect} />;
    }

    const inviteEmail = verificationData.email?.trim().toLowerCase();
    const owner = verificationData.owner?.trim().toLowerCase();
    const repo = verificationData.repo?.trim().toLowerCase();
    const source = verificationData.source;
    const redirectTo = getSafeRedirect(
      resolvedSearchParams.redirect || `/${owner}/${repo}`,
    );

    if (!inviteEmail || !owner || !repo || source !== "collaborator-invite") {
      if (isInviteEmailMatch(user?.email ?? undefined, fallbackInviteEmail)) {
        redirect(fallbackRedirect);
      }
      return <InviteUnavailable title={user?.email ? "Wrong account" : undefined} message={user?.email ? wrongAccountMessage : undefined} redirectTo={fallbackRedirect} />;
    }

    const invite = await db.query.collaboratorTable.findFirst({
      where: and(
        sql`lower(${collaboratorTable.email}) = ${inviteEmail}`,
        sql`lower(${collaboratorTable.owner}) = ${owner}`,
        sql`lower(${collaboratorTable.repo}) = ${repo}`,
      ),
    });

    if (!invite) {
      if (isInviteEmailMatch(user?.email ?? undefined, fallbackInviteEmail || inviteEmail)) {
        redirect(redirectTo);
      }
      return <InviteUnavailable title={user?.email ? "Wrong account" : undefined} message={user?.email ? getWrongAccountInviteMessage(user.email, fallbackInviteEmail || inviteEmail) : "This invitation is no longer available. Ask the repository owner to send you a new invite if you still need access."} redirectTo={redirectTo} />;
    }

    const baseUrl = getBaseUrl();
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
  const inviteEmail = fallbackInviteEmail;
  const owner = fallbackOwner;
  const repo = fallbackRepo;

  if (!inviteEmail || !owner || !repo) {
    return <InviteUnavailable message="This invitation link is invalid." redirectTo={fallbackRedirect} />;
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
    if (isInviteEmailMatch(user?.email ?? undefined, inviteEmail)) {
      redirect(fallbackRedirect);
    }
    return <InviteUnavailable title={user?.email ? "Wrong account" : undefined} message={user?.email ? getWrongAccountInviteMessage(user.email, inviteEmail) : "This invitation is no longer available. Ask the repository owner to send you a new invite if you still need access."} redirectTo={fallbackRedirect} />;
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
