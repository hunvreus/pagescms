import { and, count, eq, inArray, lt, min, ne, or, sql } from "drizzle-orm";
import path from "path";
import { db } from "@/db";
import { cacheFileTable } from "@/db/schema";
import {
  deleteCacheFileMetaByPaths,
  getCacheFileMeta,
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

const CACHE_META_SYNC_STALE_MS = parseInt(
  process.env.CACHE_META_SYNC_STALE_MS || "15000",
  10,
);

const BRANCH_CACHE_SCOPE: CacheScope = {
  path: "",
  context: "branch",
};

const getCacheFileMetaKey = (owner: string, repo: string, branch: string) =>
  `${owner.toLowerCase()}::${repo.toLowerCase()}::${branch}`;

const getScopeMetaKey = (owner: string, repo: string, branch: string, scope: CacheScope) =>
  `${getCacheFileMetaKey(owner, repo, branch)}::${scope.context}::${scope.path}`;

const getFolderScope = (context: Exclude<CacheScopeContext, "branch">, folderPath: string): CacheScope => ({
  path: folderPath,
  context,
});

const getScopedMeta = (
  owner: string,
  repo: string,
  branch: string,
  scope: CacheScope,
) => getCacheFileMeta(owner, repo, branch, scope);

const upsertScopedMeta = (
  owner: string,
  repo: string,
  branch: string,
  scope: CacheScope,
  values: {
    commitSha?: string | null;
    commitTimestamp?: Date | null;
    targetCommitSha?: string | null;
    targetCommitTimestamp?: Date | null;
    status?: string;
    error?: string | null;
    lastCheckedAt?: Date;
  } = {},
) => upsertCacheFileMeta(owner, repo, branch, {
  ...values,
  path: scope.path,
  context: scope.context,
});

const waitForScopeReady = async (
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
    const meta = await getScopedMeta(owner, repo, branch, scope);
    if (!meta || meta.status !== "syncing") return meta;
    if (Date.now() >= deadline) return meta;
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

const getDirectFolderPathsForChanges = (changedPaths: string[]): string[] => (
  Array.from(new Set(
    changedPaths
      .filter(Boolean)
      .map((changedPath) => getParentPath(changedPath)),
  ))
);

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

const markFolderScopesOk = async (
  owner: string,
  repo: string,
  branch: string,
  context: Exclude<CacheScopeContext, "branch">,
  folderPaths: string[],
  commit?: { sha: string; timestamp: number },
) => {
  const timestamp = commit?.timestamp ? new Date(commit.timestamp) : null;
  await Promise.all(folderPaths.map((folderPath) => upsertScopedMeta(
    owner,
    repo,
    branch,
    getFolderScope(context, folderPath),
    {
      status: "ok",
      error: null,
      commitSha: commit?.sha ?? null,
      commitTimestamp: timestamp,
      targetCommitSha: null,
      targetCommitTimestamp: null,
    },
  )));
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
    targetCommitSha: null,
    targetCommitTimestamp: null,
  });
};

const claimFolderScopes = async (
  owner: string,
  repo: string,
  branch: string,
  context: Exclude<CacheScopeContext, "branch">,
  folderPaths: string[],
  commit?: { sha: string; timestamp: number },
) => {
  const claimed: string[] = [];
  const targetCommitTimestamp = commit?.timestamp
    ? new Date(commit.timestamp)
    : null;

  for (const folderPath of [...new Set(folderPaths)].sort()) {
    const acquired = await tryClaimCacheFileMeta(owner, repo, branch, {
      path: folderPath,
      context,
      targetCommitSha: commit?.sha ?? null,
      targetCommitTimestamp,
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

const updateParentFolderCachesBatch = async (
  owner: string,
  repo: string,
  branch: string,
  addedPaths: string[],
  deletedPaths: string[],
) => {
  const lowerOwner = owner.toLowerCase();
  const lowerRepo = repo.toLowerCase();

  const affectedPaths = [...addedPaths, ...deletedPaths];
  if (affectedPaths.length === 0) return;

  const allRelevantPaths = new Set<string>();
  affectedPaths.forEach((filePath) => {
    const parent = getParentPath(filePath);
    if (parent !== "") allRelevantPaths.add(parent);
    getAncestorPaths(filePath).forEach((ancestor) => allRelevantPaths.add(ancestor));
  });

  const relevantPathsArray = Array.from(allRelevantPaths);
  if (relevantPathsArray.length === 0) return;

  const existingDirEntries = await db.query.cacheFileTable.findMany({
    where: and(
      eq(cacheFileTable.owner, lowerOwner),
      eq(cacheFileTable.repo, lowerRepo),
      eq(cacheFileTable.branch, branch),
      eq(cacheFileTable.type, "dir"),
      inArray(cacheFileTable.path, relevantPathsArray),
    ),
    columns: { path: true, parentPath: true, context: true },
  });
  const existingDirMap = new Map(existingDirEntries.map((dir) =>
    [dir.path, { parentPath: dir.parentPath, context: dir.context }],
  ));

  const dirsToInsertData = new Map<string, typeof cacheFileTable.$inferInsert>();
  const parentPathsNeedingContext = new Set<string>();
  const now = new Date();

  if (addedPaths.length > 0) {
    for (const filePath of addedPaths) {
      const ancestors = getAncestorPaths(filePath);
      const directParent = getParentPath(filePath);
      const pathsToCheckForAdd = directParent === "" ? ancestors : [directParent, ...ancestors];

      for (const dirPath of pathsToCheckForAdd) {
        if (!existingDirMap.has(dirPath) && !dirsToInsertData.has(dirPath)) {
          const parentDir = getParentPath(dirPath);
          if (parentDir !== "") {
            parentPathsNeedingContext.add(parentDir);
          }
          dirsToInsertData.set(dirPath, {
            context: "collection",
            owner: lowerOwner,
            repo: lowerRepo,
            branch,
            path: dirPath,
            parentPath: parentDir,
            name: path.basename(dirPath),
            type: "dir",
            updatedAt: now,
            content: null,
            sha: null,
            size: null,
            downloadUrl: null,
            commitSha: null,
            commitTimestamp: null,
          });
        }
      }
    }
  }

  const parentContextMap = new Map<string, string>();
  if (parentPathsNeedingContext.size > 0) {
    const parentPathsForQuery = Array.from(parentPathsNeedingContext);
    const contextResults = await db.select({
      parentPath: cacheFileTable.parentPath,
      context: min(cacheFileTable.context),
    })
      .from(cacheFileTable)
      .where(and(
        eq(cacheFileTable.owner, lowerOwner),
        eq(cacheFileTable.repo, lowerRepo),
        eq(cacheFileTable.branch, branch),
        inArray(cacheFileTable.parentPath, parentPathsForQuery),
      ))
      .groupBy(cacheFileTable.parentPath);

    contextResults.forEach((result) => {
      if (result.context) {
        parentContextMap.set(result.parentPath, result.context);
      }
    });

    dirsToInsertData.forEach((data) => {
      if (parentContextMap.has(data.parentPath)) {
        data.context = parentContextMap.get(data.parentPath)!;
      }
    });
  }

  if (deletedPaths.length > 0) {
    const nonEmptyDirsResult = await db.selectDistinct({ parentPath: cacheFileTable.parentPath })
      .from(cacheFileTable)
      .where(and(
        eq(cacheFileTable.owner, lowerOwner),
        eq(cacheFileTable.repo, lowerRepo),
        eq(cacheFileTable.branch, branch),
        inArray(cacheFileTable.parentPath, relevantPathsArray),
      ));
    const nonEmptyDirs = new Set(nonEmptyDirsResult.map((row) => row.parentPath));

    const dirPathsToDelete = new Set<string>();
    for (const filePath of deletedPaths) {
      const ancestors = getAncestorPaths(filePath);
      const directParent = getParentPath(filePath);
      const pathsToCheckForDelete = directParent === "" ? ancestors : [directParent, ...ancestors];

      for (const dirPath of [...pathsToCheckForDelete].reverse()) {
        if (existingDirMap.has(dirPath) && !nonEmptyDirs.has(dirPath)) {
          dirPathsToDelete.add(dirPath);
        } else if (nonEmptyDirs.has(dirPath)) {
          break;
        }
      }
    }

    const dirsToDeleteArray = Array.from(dirPathsToDelete);
    if (dirsToDeleteArray.length > 0) {
      try {
        await db.delete(cacheFileTable)
          .where(and(
            eq(cacheFileTable.owner, lowerOwner),
            eq(cacheFileTable.repo, lowerRepo),
            eq(cacheFileTable.branch, branch),
            eq(cacheFileTable.type, "dir"),
            inArray(cacheFileTable.path, dirsToDeleteArray),
          ));
      } catch (error) {
        console.error("Error deleting batch parent dir cache entries:", error);
      }
    }
  }

  const dirsToInsert = Array.from(dirsToInsertData.values());
  if (dirsToInsert.length > 0) {
    try {
      await db.insert(cacheFileTable)
        .values(dirsToInsert)
        .onConflictDoNothing({
          target: [
            cacheFileTable.owner,
            cacheFileTable.repo,
            cacheFileTable.branch,
            cacheFileTable.path,
          ],
        });
    } catch (error) {
      console.error("Error inserting batch parent dir cache entries:", error);
    }
  }
};

const updateParentFolderCache = async (
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
  operation: "add" | "delete",
) => {
  const lowerOwner = owner.toLowerCase();
  const lowerRepo = repo.toLowerCase();
  const ancestors = getAncestorPaths(filePath);
  const directParent = getParentPath(filePath);
  const relevantPaths = directParent === "" ? ancestors : [directParent, ...ancestors];

  if (relevantPaths.length === 0) return;

  const now = new Date();

  if (operation === "add") {
    const dirsToInsertData = new Map<string, typeof cacheFileTable.$inferInsert>();
    for (const dirPath of relevantPaths) {
      if (dirsToInsertData.has(dirPath)) continue;

      const existingEntry = await db.query.cacheFileTable.findFirst({
        where: and(
          eq(cacheFileTable.owner, lowerOwner),
          eq(cacheFileTable.repo, lowerRepo),
          eq(cacheFileTable.branch, branch),
          eq(cacheFileTable.path, dirPath),
          eq(cacheFileTable.type, "dir"),
        ),
        columns: { id: true },
      });

      if (!existingEntry) {
        const parentDir = getParentPath(dirPath);
        let context = "collection";
        if (parentDir !== "") {
          const contextEntry = await db.query.cacheFileTable.findFirst({
            where: and(
              eq(cacheFileTable.owner, lowerOwner),
              eq(cacheFileTable.repo, lowerRepo),
              eq(cacheFileTable.branch, branch),
              eq(cacheFileTable.parentPath, parentDir),
            ),
            columns: { context: true },
          });
          if (contextEntry) {
            context = contextEntry.context;
          }
        }
        dirsToInsertData.set(dirPath, {
          context,
          owner: lowerOwner,
          repo: lowerRepo,
          branch,
          path: dirPath,
          parentPath: parentDir,
          name: path.basename(dirPath),
          type: "dir",
          updatedAt: now,
          content: null,
          sha: null,
          size: null,
          downloadUrl: null,
          commitSha: null,
          commitTimestamp: null,
        });
      }
    }
    const dirsToInsert = Array.from(dirsToInsertData.values());
    if (dirsToInsert.length > 0) {
      try {
        await db.insert(cacheFileTable)
          .values(dirsToInsert)
          .onConflictDoNothing({
            target: [
              cacheFileTable.owner,
              cacheFileTable.repo,
              cacheFileTable.branch,
              cacheFileTable.path,
            ],
          });
      } catch (error) {
        console.error("Error inserting single parent dir cache entries:", error);
      }
    }
    return;
  }

  const dirPathsToDelete = new Set<string>();
  for (const dirPath of [...relevantPaths].reverse()) {
    const childrenResult = await db.select({ count: count() })
      .from(cacheFileTable)
      .where(and(
        eq(cacheFileTable.owner, lowerOwner),
        eq(cacheFileTable.repo, lowerRepo),
        eq(cacheFileTable.branch, branch),
        eq(cacheFileTable.parentPath, dirPath),
      ))
      .limit(1);

    if (childrenResult[0]?.count === 0) {
      const existingEntry = await db.query.cacheFileTable.findFirst({
        where: and(
          eq(cacheFileTable.owner, lowerOwner),
          eq(cacheFileTable.repo, lowerRepo),
          eq(cacheFileTable.branch, branch),
          eq(cacheFileTable.path, dirPath),
          eq(cacheFileTable.type, "dir"),
        ),
        columns: { id: true },
      });
      if (existingEntry) {
        dirPathsToDelete.add(dirPath);
      }
    } else {
      break;
    }
  }

  const dirsToDeleteArray = Array.from(dirPathsToDelete);
  if (dirsToDeleteArray.length > 0) {
    try {
      await db.delete(cacheFileTable).where(and(
        eq(cacheFileTable.owner, lowerOwner),
        eq(cacheFileTable.repo, lowerRepo),
        eq(cacheFileTable.branch, branch),
        eq(cacheFileTable.type, "dir"),
        inArray(cacheFileTable.path, dirsToDeleteArray),
      ));
    } catch (error) {
      console.error("Error deleting single parent dir cache entries:", error);
    }
  }
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

  return responseEntries.repository?.object?.entries || [];
};

const replaceFolderCache = async (
  owner: string,
  repo: string,
  branch: string,
  scope: CacheScope,
  entries: typeof cacheFileTable.$inferInsert[],
  commit?: { sha: string; timestamp: number },
) => {
  const locked = await withFolderCacheLock(owner, repo, branch, scope, async (tx) => {
    await tx.delete(cacheFileTable).where(
      and(
        eq(cacheFileTable.owner, owner.toLowerCase()),
        eq(cacheFileTable.repo, repo.toLowerCase()),
        eq(cacheFileTable.branch, branch),
        eq(cacheFileTable.parentPath, scope.path),
      ),
    );

    if (entries.length > 0) {
      await tx.insert(cacheFileTable).values(entries);
    }
  });
  if (!locked.acquired) return false;

  await upsertScopedMeta(owner, repo, branch, scope, {
    status: "ok",
    error: null,
    commitSha: commit?.sha ?? null,
    commitTimestamp: commit?.timestamp ? new Date(commit.timestamp) : null,
    targetCommitSha: null,
    targetCommitTimestamp: null,
  });
  return true;
};

export {
  BRANCH_CACHE_SCOPE,
  CACHE_META_SYNC_STALE_MS,
  claimFolderScopes,
  fetchCollectionDirectoryEntries,
  getCacheFileMetaKey,
  getDirectFolderPathsForChanges,
  getAncestorPaths,
  getFolderPathsForChanges,
  getFolderScope,
  getScopeMetaKey,
  invalidateFolderScopes,
  markFolderScopeError,
  markFolderScopesOk,
  replaceFolderCache,
  updateParentFolderCache,
  updateParentFolderCachesBatch,
  upsertScopedMeta,
  waitForScopeReady,
};
