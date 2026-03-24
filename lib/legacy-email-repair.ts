import { Octokit } from "@octokit/rest";
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { accountTable, collaboratorTable, sessionTable, userTable } from "../db/schema";

type EmailCandidate = {
  email: string;
  verified: boolean | null;
  primary: boolean | null;
};

const isLegacyEmail = (email: string | null | undefined) => {
  return typeof email === "string" && email.toLowerCase().endsWith("@local.invalid");
};

const selectBestEmail = (emails: EmailCandidate[]): EmailCandidate | null => {
  return (
    emails.find((item) => item.primary && item.verified)
    ?? emails.find((item) => item.verified)
    ?? emails.find((item) => item.primary)
    ?? null
  );
};

type RepairResult =
  | { status: "noop"; reason: string }
  | { status: "updated"; userId: string; email: string }
  | { status: "merged"; fromUserId: string; toUserId: string; email: string }
  | {
    status: "skipped";
    reason: string;
    legacyUserId?: string;
    canonicalUserId?: string;
    email?: string;
    legacyGithubAccountId?: string;
    canonicalGithubAccountId?: string;
  };

const mergeUsers = async (
  fromUserId: string,
  toUserId: string,
  options?: {
    preferredEmail?: string;
    emailVerified?: boolean;
  },
) => {
  if (fromUserId === toUserId) return;

  await db.transaction(async (tx) => {
    const fromUser = await tx.query.userTable.findFirst({
      where: eq(userTable.id, fromUserId),
    });
    const toUser = await tx.query.userTable.findFirst({
      where: eq(userTable.id, toUserId),
    });

    if (!fromUser || !toUser) return;

    const fromAccounts = await tx.query.accountTable.findMany({
      where: eq(accountTable.userId, fromUserId),
    });

    for (const fromAccount of fromAccounts) {
      const existing = await tx.query.accountTable.findFirst({
        where: and(
          eq(accountTable.userId, toUserId),
          eq(accountTable.providerId, fromAccount.providerId),
          eq(accountTable.accountId, fromAccount.accountId),
        ),
      });

      if (!existing) {
        await tx
          .update(accountTable)
          .set({ userId: toUserId, updatedAt: new Date() })
          .where(eq(accountTable.id, fromAccount.id));
        continue;
      }

      const patch: Partial<typeof existing> = {};
      if (!existing.accessToken && fromAccount.accessToken) patch.accessToken = fromAccount.accessToken;
      if (!existing.refreshToken && fromAccount.refreshToken) patch.refreshToken = fromAccount.refreshToken;
      if (!existing.idToken && fromAccount.idToken) patch.idToken = fromAccount.idToken;
      if (!existing.scope && fromAccount.scope) patch.scope = fromAccount.scope;
      if (!existing.password && fromAccount.password) patch.password = fromAccount.password;
      if (!existing.accessTokenExpiresAt && fromAccount.accessTokenExpiresAt) patch.accessTokenExpiresAt = fromAccount.accessTokenExpiresAt;
      if (!existing.refreshTokenExpiresAt && fromAccount.refreshTokenExpiresAt) patch.refreshTokenExpiresAt = fromAccount.refreshTokenExpiresAt;

      if (Object.keys(patch).length > 0) {
        await tx
          .update(accountTable)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(accountTable.id, existing.id));
      }

      await tx.delete(accountTable).where(eq(accountTable.id, fromAccount.id));
    }

    await tx
      .update(sessionTable)
      .set({ userId: toUserId, updatedAt: new Date() })
      .where(eq(sessionTable.userId, fromUserId));

    await tx
      .update(collaboratorTable)
      .set({ userId: toUserId })
      .where(eq(collaboratorTable.userId, fromUserId));

    await tx
      .update(collaboratorTable)
      .set({ invitedBy: toUserId })
      .where(eq(collaboratorTable.invitedBy, fromUserId));

    await tx.delete(userTable).where(eq(userTable.id, fromUserId));

    if (options?.preferredEmail) {
      await tx
        .update(userTable)
        .set({
          email: options.preferredEmail.toLowerCase(),
          emailVerified: options.emailVerified ?? toUser.emailVerified,
          updatedAt: new Date(),
        })
        .where(eq(userTable.id, toUserId));
    }
  });
};

const repairLegacyEmailForUser = async (
  userId: string,
  options?: {
    allowAmbiguousGithubMerge?: boolean;
  },
): Promise<RepairResult> => {
  const user = await db.query.userTable.findFirst({
    where: eq(userTable.id, userId),
  });
  if (!user) return { status: "noop", reason: "user_not_found" };
  if (!isLegacyEmail(user.email)) return { status: "noop", reason: "not_legacy_email" };

  const githubAccount = await db.query.accountTable.findFirst({
    where: and(
      eq(accountTable.userId, user.id),
      eq(accountTable.providerId, "github"),
      isNotNull(accountTable.accessToken),
    ),
  });
  if (!githubAccount?.accessToken) return { status: "skipped", reason: "no_github_token" };

  const octokit = new Octokit({ auth: githubAccount.accessToken });
  const response = await octokit.request("GET /user/emails", { per_page: 100 });
  const chosen = selectBestEmail(response.data as EmailCandidate[]);
  if (!chosen?.email) return { status: "skipped", reason: "no_email_from_github" };

  const normalizedEmail = chosen.email.trim().toLowerCase();
  if (!normalizedEmail || isLegacyEmail(normalizedEmail)) {
    return { status: "skipped", reason: "invalid_resolved_email" };
  }

  const emailConflictUser = await db.query.userTable.findFirst({
    where: and(
      ne(userTable.id, user.id),
      sql`lower(${userTable.email}) = lower(${normalizedEmail})`,
    ),
  });

  if (!emailConflictUser) {
    await db
      .update(userTable)
      .set({
        email: normalizedEmail,
        emailVerified: Boolean(chosen.verified),
        updatedAt: new Date(),
      })
      .where(eq(userTable.id, user.id));
    return { status: "updated", userId: user.id, email: normalizedEmail };
  }

  if (!options?.allowAmbiguousGithubMerge) {
    const conflictGithubAccount = await db.query.accountTable.findFirst({
      where: and(
        eq(accountTable.userId, emailConflictUser.id),
        eq(accountTable.providerId, "github"),
      ),
    });

    const ambiguous =
      conflictGithubAccount
      && conflictGithubAccount.accountId !== githubAccount.accountId;

    if (ambiguous) {
      console.warn(
        "[auth] legacy email repair skipped due to ambiguous github account merge",
        {
          legacyUserId: user.id,
          canonicalUserId: emailConflictUser.id,
          normalizedEmail,
          legacyGithubAccountId: githubAccount.accountId,
          canonicalGithubAccountId: conflictGithubAccount.accountId,
        },
      );
      return {
        status: "skipped",
        reason: "ambiguous_github_account_merge",
        legacyUserId: user.id,
        canonicalUserId: emailConflictUser.id,
        email: normalizedEmail,
        legacyGithubAccountId: githubAccount.accountId,
        canonicalGithubAccountId: conflictGithubAccount.accountId,
      };
    }
  }

  await mergeUsers(user.id, emailConflictUser.id, {
    preferredEmail: normalizedEmail,
    emailVerified: Boolean(chosen.verified),
  });

  return {
    status: "merged",
    fromUserId: user.id,
    toUserId: emailConflictUser.id,
    email: normalizedEmail,
  };
};

const repairLegacyEmailOnLogin = async (_sessionId: string, userId: string) => {
  try {
    await repairLegacyEmailForUser(userId, { allowAmbiguousGithubMerge: false });
  } catch (error) {
    console.warn(
      "[auth] legacy email repair failed",
      {
        userId,
        error: error instanceof Error ? error.message : String(error),
      },
    );
  }
};

export { mergeUsers, repairLegacyEmailForUser, repairLegacyEmailOnLogin };
