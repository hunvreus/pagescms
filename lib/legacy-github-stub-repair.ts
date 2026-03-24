import { and, eq, like, ne } from "drizzle-orm";
import { db } from "../db";
import { accountTable, collaboratorTable, sessionTable, userTable } from "../db/schema";

const isLegacyEmail = (email: string | null | undefined) => {
  return typeof email === "string" && email.toLowerCase().endsWith("@local.invalid");
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

const repairLegacyGithubStubOnGithubSignIn = async (userId: string) => {
  const signedInUser = await db.query.userTable.findFirst({
    where: eq(userTable.id, userId),
  });
  if (!signedInUser?.githubUsername) return;
  if (isLegacyEmail(signedInUser.email)) return;

  const signedInGithubAccount = await db.query.accountTable.findFirst({
    where: and(
      eq(accountTable.userId, userId),
      eq(accountTable.providerId, "github"),
    ),
  });
  if (!signedInGithubAccount) return;

  const legacyStub = await db.query.userTable.findFirst({
    where: and(
      ne(userTable.id, userId),
      eq(userTable.githubUsername, signedInUser.githubUsername),
      like(userTable.email, "%@local.invalid"),
    ),
    orderBy: (table, { asc }) => [asc(table.createdAt), asc(table.id)],
  });
  if (!legacyStub) return;

  const stubGithubAccount = await db.query.accountTable.findFirst({
    where: and(
      eq(accountTable.userId, legacyStub.id),
      eq(accountTable.providerId, "github"),
    ),
  });

  if (stubGithubAccount && stubGithubAccount.accountId !== signedInGithubAccount.accountId) {
    console.warn("[auth] legacy github stub repair skipped due to ambiguous github account", {
      signedInUserId: userId,
      legacyStubUserId: legacyStub.id,
      githubUsername: signedInUser.githubUsername,
      signedInGithubAccountId: signedInGithubAccount.accountId,
      legacyStubGithubAccountId: stubGithubAccount.accountId,
    });
    return;
  }

  await mergeUsers(legacyStub.id, userId, {
    preferredEmail: signedInUser.email,
    emailVerified: signedInUser.emailVerified,
  });
};

const repairLegacyGithubStubOnLogin = async (_sessionId: string, userId: string) => {
  try {
    await repairLegacyGithubStubOnGithubSignIn(userId);
  } catch (error) {
    console.warn("[auth] legacy github stub repair failed", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export { mergeUsers, repairLegacyGithubStubOnLogin };
