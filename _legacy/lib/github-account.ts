import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accountTable, userTable } from "@/db/schema";
import { createOctokitInstance } from "@/lib/utils/octokit";

// Read the linked GitHub OAuth account for a user.
const getGithubAccount = cache(async (userId: string) => {
  return db.query.accountTable.findFirst({
    where: and(
      eq(accountTable.userId, userId),
      eq(accountTable.providerId, "github")
    )
  });
});

const getGithubId = cache(async (userId: string): Promise<number | null> => {
  const account = await getGithubAccount(userId);
  if (!account?.accountId) return null;

  const githubId = Number(account.accountId);
  return Number.isInteger(githubId) ? githubId : null;
});

// Refresh GitHub-derived profile fields after login without overwriting custom names.
const syncGithubProfileOnLogin = async (userId: string) => {
  const [user, githubAccount] = await Promise.all([
    db.query.userTable.findFirst({
      where: eq(userTable.id, userId),
    }),
    getGithubAccount(userId),
  ]);

  if (!user || !githubAccount?.accessToken) return;

  const octokit = createOctokitInstance(githubAccount.accessToken);
  const { data: profile } = await octokit.rest.users.getAuthenticated();

  const nextGithubUsername = profile.login ?? null;
  const nextImage = profile.avatar_url ?? null;
  const nextName = profile.name ?? profile.login ?? user.name;

  const patch: Partial<typeof userTable.$inferInsert> = {};

  if (user.githubUsername !== nextGithubUsername) {
    patch.githubUsername = nextGithubUsername;
  }

  if ((user.image ?? null) !== nextImage) {
    patch.image = nextImage;
  }

  // Preserve custom display names; only refresh names that still mirror GitHub identity.
  if (user.name.trim() === "" || user.name === user.githubUsername) {
    if (user.name !== nextName) {
      patch.name = nextName;
    }
  }

  if (Object.keys(patch).length === 0) return;

  await db
    .update(userTable)
    .set({
      ...patch,
      updatedAt: new Date(),
    })
    .where(eq(userTable.id, userId));
};

export { getGithubAccount, getGithubId, syncGithubProfileOnLogin };
