import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { cacheFileMetaTable, cacheFileTable } from "@/db/schema";
import {
  deleteCacheFileMetaByPaths,
  tryClaimCacheFileMeta,
  upsertCacheFileMeta,
} from "@/lib/github-cache-meta";
import { createOctokitInstance } from "@/lib/utils/octokit";
import { getParentPath } from "@/lib/utils/file";

type CacheScopeContext = "branch" | "collection" | "media";
type CacheScope = {
  path: string;
  context: CacheScopeContext;
};

const BRANCH_CACHE_SCOPE: CacheScope = {
  path: "",
  context: "branch",
};

const getCacheFileMetaKey = (owner: string, repo: string, branch: string) =>
  `${owner.toLowerCase()}::${repo.toLowerCase()}::${branch}`;

const getFolderScope = (context: Exclude<CacheScopeContext, "branch">, folderPath: string): CacheScope => ({
  path: folderPath,
  context,
});

const upsertScopedMeta = (
  owner: string,
  repo: string,
  branch: string,
  scope: CacheScope,
  values: {
    commitSha?: string | null;
    commitTimestamp?: Date | null;
    status?: string;
    error?: string | null;
    lastCheckedAt?: Date;
  } = {},
) => upsertCacheFileMeta(owner, repo, branch, {
  ...values,
  path: scope.path,
  context: scope.context,
});

const waitForScopeAndBranchMeta = async (
  owner: string,
  repo: string,
  branch: string,
  scope: CacheScope,
  options?: { timeoutMs?: number; intervalMs?: number },
) => {
  const timeoutMs = options?.timeoutMs ?? 1200;
  const intervalMs = options?.intervalMs ?? 100;
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const metas = await db.query.cacheFileMetaTable.findMany({
      where: and(
        sql`lower(${cacheFileMetaTable.owner}) = lower(${owner})`,
        sql`lower(${cacheFileMetaTable.repo}) = lower(${repo})`,
        eq(cacheFileMetaTable.branch, branch),
        or(
          and(
            eq(cacheFileMetaTable.path, scope.path),
            eq(cacheFileMetaTable.context, scope.context),
          ),
          and(
            eq(cacheFileMetaTable.path, BRANCH_CACHE_SCOPE.path),
            eq(cacheFileMetaTable.context, BRANCH_CACHE_SCOPE.context),
          ),
        ),
      ),
    });

    let scopeMeta: typeof metas[number] | undefined;
    let branchMeta: typeof metas[number] | undefined;

    for (const meta of metas) {
      if (meta.path === scope.path && meta.context === scope.context) {
        scopeMeta = meta;
      } else if (meta.path === BRANCH_CACHE_SCOPE.path && meta.context === BRANCH_CACHE_SCOPE.context) {
        branchMeta = meta;
      }
    }

    if (!scopeMeta || scopeMeta.status !== "syncing") {
      return { scopeMeta, branchMeta };
    }
    if (Date.now() >= deadline) {
      return { scopeMeta, branchMeta };
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
};

const getAncestorPaths = (filePath: string): string[] => {
  const ancestors: string[] = [];
  let currentPath = getParentPath(filePath);
  while (currentPath !== "") {
    ancestors.push(currentPath);
    currentPath = getParentPath(currentPath);
  }
  return ancestors.reverse();
};

const getFolderPathsForChanges = (changedPaths: string[]): string[] => {
  const folders = new Set<string>();

  for (const changedPath of changedPaths) {
    if (!changedPath) continue;
    const directParent = getParentPath(changedPath);
    folders.add(directParent);
    for (const ancestor of getAncestorPaths(changedPath)) {
      folders.add(ancestor);
    }
  }

  return Array.from(folders);
};

const invalidateFolderScopes = async (
  owner: string,
  repo: string,
  branch: string,
  folderPaths: string[],
) => {
  const normalizedPaths = Array.from(new Set(folderPaths));
  if (normalizedPaths.length === 0) return;
  await deleteCacheFileMetaByPaths(owner, repo, branch, normalizedPaths);
};

const withFolderCacheLock = async <T>(
  owner: string,
  repo: string,
  branch: string,
  scope: CacheScope,
  callback: (tx: any) => Promise<T>,
): Promise<{ acquired: boolean; value?: T }> => {
  const primary = `${owner.toLowerCase()}::${repo.toLowerCase()}::${branch}`;
  const secondary = `${scope.context}::${scope.path}`;

  return db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      select pg_try_advisory_xact_lock(hashtext(${primary}), hashtext(${secondary})) as locked
    `);
    const locked = Boolean((result as any)?.[0]?.locked);
    if (!locked) return { acquired: false };

    return {
      acquired: true,
      value: await callback(tx),
    };
  });
};

const markFolderScopeError = async (
  owner: string,
  repo: string,
  branch: string,
  context: Exclude<CacheScopeContext, "branch">,
  folderPath: string,
  error: string,
) => {
  await upsertScopedMeta(owner, repo, branch, getFolderScope(context, folderPath), {
    status: "error",
    error,
  });
};

const claimFolderScopes = async (
  owner: string,
  repo: string,
  branch: string,
  context: Exclude<CacheScopeContext, "branch">,
  folderPaths: string[],
) => {
  const claimed: string[] = [];

  for (const folderPath of [...new Set(folderPaths)].sort()) {
    const acquired = await tryClaimCacheFileMeta(owner, repo, branch, {
      path: folderPath,
      context,
      error: null,
    });

    if (!acquired) {
      if (claimed.length > 0) {
        await invalidateFolderScopes(owner, repo, branch, claimed);
      }
      return false;
    }

    claimed.push(folderPath);
  }

  return true;
};

const fetchCollectionDirectoryEntries = async (
  owner: string,
  repo: string,
  branch: string,
  dirPath: string,
  token: string,
) => {
  const octokit = createOctokitInstance(token);
  const queryEntries = `
    query ($owner: String!, $repo: String!, $expression: String!) {
      repository(owner: $owner, name: $repo) {
        object(expression: $expression) {
          ... on Tree {
            entries {
              name
              path
              type
              object {
                ... on Blob {
                  text
                  oid
                  byteSize
                }
              }
            }
          }
        }
      }
    }
  `;
  const responseEntries: any = await octokit.graphql(queryEntries, {
    owner,
    repo,
    expression: `${branch}:${dirPath}`,
  });

  if (!responseEntries.repository) {
    throw new Error(`Repository "${owner}/${repo}" was not found.`);
  }

  const tree = responseEntries.repository.object;

  if (!tree) {
    // Git does not track empty directories. Treat a missing tree object as an empty folder
    // result so configured-but-empty collection paths do not 500.
    return [];
  }

  if (!Array.isArray(tree.entries)) {
    throw new Error(`Expected directory entries for "${dirPath}" but GitHub returned an invalid tree response.`);
  }

  return tree.entries;
};

const fetchMediaDirectoryEntries = async (
  owner: string,
  repo: string,
  branch: string,
  dirPath: string,
  token: string,
) => {
  const octokit = createOctokitInstance(token);

  try {
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: dirPath,
      ref: branch,
    });

    if (!Array.isArray(response.data)) {
      throw new Error("Expected a directory but found a file.");
    }

    return response.data;
  } catch (error: any) {
    if (error?.status === 404 && error?.response?.data?.message === "Not Found") {
      return [];
    }

    throw error;
  }
};

const replaceFolderCache = async (
  owner: string,
  repo: string,
  branch: string,
  scope: CacheScope,
  entries: typeof cacheFileTable.$inferInsert[],
  commit?: { sha: string; timestamp: number },
) => {
  const now = new Date();
  const lowerOwner = owner.toLowerCase();
  const lowerRepo = repo.toLowerCase();
  const locked = await withFolderCacheLock(owner, repo, branch, scope, async (tx) => {
    await tx.delete(cacheFileTable).where(
      and(
        eq(cacheFileTable.owner, lowerOwner),
        eq(cacheFileTable.repo, lowerRepo),
        eq(cacheFileTable.branch, branch),
        eq(cacheFileTable.parentPath, scope.path),
      ),
    );

    if (entries.length > 0) {
      await tx.insert(cacheFileTable).values(entries);

      await tx.insert(cacheFileMetaTable).values({
        owner: lowerOwner,
        repo: lowerRepo,
        branch,
        path: scope.path,
        context: scope.context,
        commitSha: commit?.sha ?? null,
        commitTimestamp: commit?.timestamp ? new Date(commit.timestamp) : null,
        status: "ok",
        error: null,
        updatedAt: now,
        lastCheckedAt: now,
      }).onConflictDoUpdate({
        target: [
          cacheFileMetaTable.owner,
          cacheFileMetaTable.repo,
          cacheFileMetaTable.branch,
          cacheFileMetaTable.path,
          cacheFileMetaTable.context,
        ],
        set: {
          commitSha: commit?.sha ?? null,
          commitTimestamp: commit?.timestamp ? new Date(commit.timestamp) : null,
          status: "ok",
          error: null,
          updatedAt: now,
          lastCheckedAt: now,
        },
      });
      return;
    }

    await tx.delete(cacheFileMetaTable).where(
      and(
        eq(cacheFileMetaTable.owner, lowerOwner),
        eq(cacheFileMetaTable.repo, lowerRepo),
        eq(cacheFileMetaTable.branch, branch),
        eq(cacheFileMetaTable.path, scope.path),
        eq(cacheFileMetaTable.context, scope.context),
      ),
    );
  });
  if (!locked.acquired) return false;
  return true;
};

export {
  BRANCH_CACHE_SCOPE,
  claimFolderScopes,
  fetchCollectionDirectoryEntries,
  fetchMediaDirectoryEntries,
  getCacheFileMetaKey,
  getFolderPathsForChanges,
  getFolderScope,
  invalidateFolderScopes,
  markFolderScopeError,
  replaceFolderCache,
  upsertScopedMeta,
  waitForScopeAndBranchMeta,
};
