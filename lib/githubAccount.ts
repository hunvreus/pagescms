import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accountTable } from "@/db/schema";

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

export { getGithubAccount, getGithubId };
