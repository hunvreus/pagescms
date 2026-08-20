import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { cachePermissionTable } from "@/db/schema";
import { createOctokitInstance } from "@/lib/utils/octokit";

const PERMISSIONS_CACHE_TTL_MIN =
  process.env.PERMISSIONS_TTL_MIN ||
  process.env.PERM_TTL_MIN ||
  process.env.PERMISSION_CACHE_TTL ||
  "60";

const checkRepoAccess = async (
  token: string,
  owner: string,
  repo: string,
  githubId: number,
): Promise<boolean> => {
  const now = new Date();
  const ttl = parseInt(PERMISSIONS_CACHE_TTL_MIN, 10) * 60 * 1000;

  const cacheEntry = await db.query.cachePermissionTable.findFirst({
    where: and(
      eq(cachePermissionTable.githubId, githubId),
      eq(cachePermissionTable.owner, owner.toLowerCase()),
      eq(cachePermissionTable.repo, repo.toLowerCase()),
      gt(cachePermissionTable.lastUpdated, new Date(now.getTime() - ttl)),
    ),
  });

  if (cacheEntry) return true;

  try {
    const octokit = createOctokitInstance(token);
    const response = await octokit.rest.repos.get({ owner, repo });

    if (response.status === 200) {
      await db.insert(cachePermissionTable)
        .values({
          githubId,
          owner: owner.toLowerCase(),
          repo: repo.toLowerCase(),
          lastUpdated: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            cachePermissionTable.githubId,
            cachePermissionTable.owner,
            cachePermissionTable.repo,
          ],
          set: { lastUpdated: new Date() },
        });
    }

    return response.status === 200;
  } catch (error) {
    console.error("Error checking repo access", error);
    return false;
  }
};

const clearPermissionCache = async (
  owner: string,
  repo?: string,
  githubId?: number,
) => {
  const conditions = [];
  conditions.push(eq(cachePermissionTable.owner, owner.toLowerCase()));
  if (repo) conditions.push(eq(cachePermissionTable.repo, repo.toLowerCase()));
  if (githubId != null) conditions.push(eq(cachePermissionTable.githubId, githubId));
  await db.delete(cachePermissionTable).where(and(...conditions));
};

export { checkRepoAccess, clearPermissionCache };
