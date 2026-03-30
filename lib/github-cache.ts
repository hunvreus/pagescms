/**
 * Helper functions to manage the database cache.
 */

import { db } from "@/db";
import { eq, and, inArray, gt, count, min, sql } from "drizzle-orm";
import { cacheFileTable, cachePermissionTable } from "@/db/schema";
import { createOctokitInstance } from "@/lib/utils/octokit";
import { getParentPath } from "@/lib/utils/file";
import { deleteCacheFileMeta, deleteCacheFileMetaByPaths, getCacheFileMeta, upsertCacheFileMeta } from "@/lib/cache-file-meta";
import { Repo } from "@/types/repo";
import path from "path";

type FileChange = {
  path: string;
  sha: string;
};

type BranchHeadCacheEntry = {
  sha: string;
  expiresAt: number;
};

type RepoSnapshotCacheEntry = {
  value: Repo;
  expiresAt: number;
};

const BRANCH_HEAD_TTL_MS = parseInt(
  process.env.BRANCH_HEAD_TTL_MS ||
    process.env.HEAD_TTL_MS ||
    process.env.BRANCH_HEAD_CACHE_TTL_MS ||
    "15000",
  10,
);
const REPO_META_TTL_MS = parseInt(
  process.env.REPO_META_TTL_MS ||
    process.env.SNAP_TTL_MS ||
    process.env.REPO_SNAPSHOT_CACHE_TTL_MS ||
    "15000",
  10,
);
const CACHE_RECONCILE_INTERVAL_MIN =
  process.env.CACHE_CHECK_MIN ||
  process.env.CACHE_RECONCILE_INTERVAL_MIN ||
  process.env.CACHE_FILE_CHECK_TTL ||
  "5";
const FILE_CACHE_TTL_MIN =
  process.env.FILE_TTL_MIN || process.env.FILE_CACHE_TTL || "1440";
const FILE_CACHE_EXPIRY_DISABLED = FILE_CACHE_TTL_MIN === "-1";
const PERMISSIONS_CACHE_TTL_MIN =
  process.env.PERMISSIONS_TTL_MIN ||
  process.env.PERM_TTL_MIN ||
  process.env.PERMISSION_CACHE_TTL ||
  "60";

const branchHeadCache = new Map<string, BranchHeadCacheEntry>();
const branchHeadInFlight = new Map<string, Promise<string>>();
const repoSnapshotCache = new Map<string, RepoSnapshotCacheEntry>();
const repoSnapshotInFlight = new Map<string, Promise<Repo>>();

const getBranchHeadCacheKey = (owner: string, repo: string, branch: string) =>
  `${owner.toLowerCase()}::${repo.toLowerCase()}::${branch}`;

const getRepoSnapshotCacheKey = (owner: string, repo: string) =>
  `${owner.toLowerCase()}::${repo.toLowerCase()}`;

const setBranchHeadSha = (owner: string, repo: string, branch: string, sha: string) => {
  const key = getBranchHeadCacheKey(owner, repo, branch);
  branchHeadCache.set(key, {
    sha,
    expiresAt: Date.now() + BRANCH_HEAD_TTL_MS,
  });
};

const getBranchHeadSha = async (
  owner: string,
  repo: string,
  branch: string,
  token: string,
  options?: { force?: boolean },
): Promise<string> => {
  const key = getBranchHeadCacheKey(owner, repo, branch);

  if (!options?.force) {
    const cached = branchHeadCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.sha;
  }

  const inFlight = branchHeadInFlight.get(key);
  if (inFlight) return inFlight;

  const job = (async () => {
    const octokit = createOctokitInstance(token);
    const response = await octokit.rest.repos.getBranch({
      owner,
      repo,
      branch,
    });
    const sha = response.data.commit.sha;
    setBranchHeadSha(owner, repo, branch, sha);
    return sha;
  })();

  branchHeadInFlight.set(key, job);
  try {
    return await job;
  } finally {
    branchHeadInFlight.delete(key);
  }
};

const getRepoSnapshot = async (
  owner: string,
  repo: string,
  token: string,
  options?: { force?: boolean },
): Promise<Repo> => {
  const key = getRepoSnapshotCacheKey(owner, repo);

  if (!options?.force) {
    const cached = repoSnapshotCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
  }

  const inFlight = repoSnapshotInFlight.get(key);
  if (inFlight) return inFlight;

  const job = (async () => {
    const octokit = createOctokitInstance(token);
    const [repoResponse, firstBranchesResponse] = await Promise.all([
      octokit.rest.repos.get({ owner, repo }),
      octokit.rest.repos.listBranches({ owner, repo, page: 1, per_page: 100 }),
    ]);

    const branches = [...firstBranchesResponse.data];
    let page = 2;
    let lastPageCount = firstBranchesResponse.data.length;
    while (lastPageCount === 100) {
      const branchesResponse = await octokit.rest.repos.listBranches({
        owner,
        repo,
        page,
        per_page: 100,
      });
      lastPageCount = branchesResponse.data.length;
      if (lastPageCount === 0) break;
      branches.push(...branchesResponse.data);
      page++;
    }

    const value: Repo = {
      id: repoResponse.data.id,
      owner: repoResponse.data.owner.login,
      ownerId: repoResponse.data.owner.id,
      repo: repoResponse.data.name,
      defaultBranch: repoResponse.data.default_branch,
      branches: branches.map((branchItem) => branchItem.name),
      isPrivate: repoResponse.data.private,
    };

    repoSnapshotCache.set(key, {
      value,
      expiresAt: Date.now() + REPO_META_TTL_MS,
    });
    return value;
  })();

  repoSnapshotInFlight.set(key, job);
  try {
    return await job;
  } finally {
    repoSnapshotInFlight.delete(key);
  }
};

type FileOperation = {
  type: 'add' | 'modify' | 'delete' | 'rename';
  path: string;
  newPath?: string;
  sha?: string;
  content?: string;
  size?: number;
  downloadUrl?: string;
  commit?: {
    sha: string;
    timestamp: number;
  };
};

type CacheScopeContext = 'branch' | 'collection' | 'media';
type CacheScope = {
  path: string;
  context: CacheScopeContext;
};

const cacheFileReconcileInFlight = new Map<string, Promise<void>>();
const cacheFileCheckTTLms = parseInt(CACHE_RECONCILE_INTERVAL_MIN, 10) * 60 * 1000;

const getCacheFileMetaKey = (owner: string, repo: string, branch: string) =>
  `${owner.toLowerCase()}::${repo.toLowerCase()}::${branch}`;

const getScopeMetaKey = (owner: string, repo: string, branch: string, scope: CacheScope) =>
  `${getCacheFileMetaKey(owner, repo, branch)}::${scope.context}::${scope.path}`;

const BRANCH_CACHE_SCOPE: CacheScope = {
  path: "",
  context: "branch",
};

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

const markFolderScopesSyncing = async (
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
      status: "syncing",
      error: null,
      targetCommitSha: commit?.sha ?? null,
      targetCommitTimestamp: timestamp,
    },
  )));
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

const reconcileFileCache = async (
  owner: string,
  repo: string,
  branch: string,
  token: string,
  options?: { forceClear?: boolean }
) => {
  const key = getCacheFileMetaKey(owner, repo, branch);
  if (cacheFileReconcileInFlight.has(key)) {
    return cacheFileReconcileInFlight.get(key)!;
  }

  const job = (async () => {
    try {
      const currentMeta = await getCacheFileMeta(owner, repo, branch, BRANCH_CACHE_SCOPE);
      const headSha = await getBranchHeadSha(owner, repo, branch, token);
      const shouldClear =
        options?.forceClear ||
        !currentMeta?.commitSha ||
        currentMeta.commitSha !== headSha;

      await upsertCacheFileMeta(owner, repo, branch, {
        path: BRANCH_CACHE_SCOPE.path,
        context: BRANCH_CACHE_SCOPE.context,
        commitSha: currentMeta?.commitSha ?? null,
        commitTimestamp: currentMeta?.commitTimestamp ?? null,
        status: "syncing",
        error: null,
        targetCommitSha: headSha,
      });

      if (shouldClear) {
        await clearFileCache(owner, repo, branch);
        await deleteCacheFileMeta(owner, repo, branch);
        await upsertCacheFileMeta(owner, repo, branch, {
          path: BRANCH_CACHE_SCOPE.path,
          context: BRANCH_CACHE_SCOPE.context,
          status: "syncing",
          error: null,
          targetCommitSha: headSha,
        });
      }

      await upsertCacheFileMeta(owner, repo, branch, {
        path: BRANCH_CACHE_SCOPE.path,
        context: BRANCH_CACHE_SCOPE.context,
        commitSha: headSha,
        status: "ok",
        error: null,
        targetCommitSha: null,
        targetCommitTimestamp: null,
      });
    } catch (error: any) {
      await upsertCacheFileMeta(owner, repo, branch, {
        path: BRANCH_CACHE_SCOPE.path,
        context: BRANCH_CACHE_SCOPE.context,
        status: "error",
        error: error?.message ? String(error.message) : "Cache reconcile failed.",
        targetCommitSha: null,
        targetCommitTimestamp: null,
      });
      throw error;
    } finally {
      cacheFileReconcileInFlight.delete(key);
    }
  })();

  cacheFileReconcileInFlight.set(key, job);
  return job;
};

const ensureFileCacheFreshness = async (
  owner: string,
  repo: string,
  branch: string,
  token: string,
  options?: { force?: boolean }
) => {
  const meta = await getCacheFileMeta(owner, repo, branch, BRANCH_CACHE_SCOPE);
  const due =
    options?.force ||
    !meta?.lastCheckedAt ||
    Date.now() - meta.lastCheckedAt.getTime() > cacheFileCheckTTLms;

  if (!due) return;
  await reconcileFileCache(owner, repo, branch, token);
};

// Helper to get all non-root ancestor paths (e.g., [a, a/b, a/b/c] for a/b/c/file.txt)
const getAncestorPaths = (filePath: string): string[] => {
  const ancestors: string[] = [];
  let currentPath = getParentPath(filePath);
  while (currentPath !== '') {
    ancestors.push(currentPath);
    currentPath = getParentPath(currentPath);
  }
  return ancestors.reverse();
};

// Batch update parent directory cache entries
const updateParentFolderCachesBatch = async (
  owner: string,
  repo: string,
  branch: string,
  addedPaths: string[],
  deletedPaths: string[]
) => {
  const lowerOwner = owner.toLowerCase();
  const lowerRepo = repo.toLowerCase();

  const affectedPaths = [...addedPaths, ...deletedPaths];
  if (affectedPaths.length === 0) return;

  // 1. Collect all unique directory paths potentially affected
  const allRelevantPaths = new Set<string>();
  affectedPaths.forEach(p => {
    const parent = getParentPath(p);
    if (parent !== '') allRelevantPaths.add(parent);
    getAncestorPaths(p).forEach(ancestor => allRelevantPaths.add(ancestor));
  });

  const relevantPathsArray = Array.from(allRelevantPaths);
  if (relevantPathsArray.length === 0) return; // Only root files affected

  // 2. Fetch existing 'dir' entries
  const existingDirEntries = await db.query.cacheFileTable.findMany({
    where: and(
      eq(cacheFileTable.owner, lowerOwner),
      eq(cacheFileTable.repo, lowerRepo),
      eq(cacheFileTable.branch, branch),
      eq(cacheFileTable.type, 'dir'),
      inArray(cacheFileTable.path, relevantPathsArray)
    ),
    columns: { path: true, parentPath: true, context: true }
  });
  const existingDirMap = new Map(existingDirEntries.map(dir =>
    [dir.path, { parentPath: dir.parentPath, context: dir.context }]
  ));

  // 3. Determine additions
  const dirsToInsertData = new Map<string, typeof cacheFileTable.$inferInsert>();
  const parentPathsNeedingContext = new Set<string>();
  const now = new Date();

  if (addedPaths.length > 0) {
    for (const filePath of addedPaths) {
      const ancestors = getAncestorPaths(filePath);
      const directParent = getParentPath(filePath);
      const pathsToCheckForAdd = directParent === '' ? ancestors : [directParent, ...ancestors];

      for (const dirPath of pathsToCheckForAdd) {
        if (!existingDirMap.has(dirPath) && !dirsToInsertData.has(dirPath)) {
          const parentDir = getParentPath(dirPath);
          if (parentDir !== '') {
            parentPathsNeedingContext.add(parentDir);
          }
          // Add placeholder, context will be filled later if possible
          dirsToInsertData.set(dirPath, {
            context: 'collection', // Default, will be updated
            owner: lowerOwner, repo: lowerRepo, branch,
            path: dirPath, parentPath: parentDir, name: path.basename(dirPath),
            type: 'dir', updatedAt: now,
            content: null, sha: null, size: null, downloadUrl: null, commitSha: null, commitTimestamp: null
          });
        }
      }
    }
  }

  // 4. Get parent context (only if insertions are needed)
  const parentContextMap = new Map<string, string>();
  if (parentPathsNeedingContext.size > 0) {
    const parentPathsForQuery = Array.from(parentPathsNeedingContext);

    // Fetch context for one child per needed parent path using groupBy
    const contextResults = await db.select({
        parentPath: cacheFileTable.parentPath,
        // Use min(context) - 'collection' < 'media' to prioritize collection
        context: min(cacheFileTable.context)
      })
      .from(cacheFileTable)
      .where(and(
        eq(cacheFileTable.owner, lowerOwner),
        eq(cacheFileTable.repo, lowerRepo),
        eq(cacheFileTable.branch, branch),
        inArray(cacheFileTable.parentPath, parentPathsForQuery)
      ))
      .groupBy(cacheFileTable.parentPath);

    // Populate the map from the single query result
    contextResults.forEach(result => {
      // Ensure result.context is not null before casting/setting
      if (result.context) {
           parentContextMap.set(result.parentPath, result.context);
      }
    });

    // Update context in the insertion data
    dirsToInsertData.forEach((data) => {
      if (parentContextMap.has(data.parentPath)) {
        data.context = parentContextMap.get(data.parentPath)!;
      }
    });
  }

  // 5. Determine and execute deletions (only if files were deleted)
  if (deletedPaths.length > 0) {
    // Find which relevant paths still have children
    const nonEmptyDirsResult = await db.selectDistinct({ parentPath: cacheFileTable.parentPath })
      .from(cacheFileTable)
      .where(and(
        eq(cacheFileTable.owner, lowerOwner),
        eq(cacheFileTable.repo, lowerRepo),
        eq(cacheFileTable.branch, branch),
        inArray(cacheFileTable.parentPath, relevantPathsArray)
      ));
    const nonEmptyDirs = new Set(nonEmptyDirsResult.map(r => r.parentPath));

    const dirPathsToDelete = new Set<string>();
    for (const filePath of deletedPaths) {
      const ancestors = getAncestorPaths(filePath);
      const directParent = getParentPath(filePath);
      const pathsToCheckForDelete = directParent === '' ? ancestors : [directParent, ...ancestors];

      for (const dirPath of [...pathsToCheckForDelete].reverse()) { // Check bottom-up
        if (existingDirMap.has(dirPath) && !nonEmptyDirs.has(dirPath)) {
          dirPathsToDelete.add(dirPath);
        } else if (nonEmptyDirs.has(dirPath)) {
          break; // If this dir isn't empty, parents won't be empty due to this path
        }
      }
    }

    // Batch delete
    const dirsToDeleteArray = Array.from(dirPathsToDelete);
    if (dirsToDeleteArray.length > 0) {
      try {
        await db.delete(cacheFileTable)
          .where(and(
            eq(cacheFileTable.owner, lowerOwner),
            eq(cacheFileTable.repo, lowerRepo),
            eq(cacheFileTable.branch, branch),
            eq(cacheFileTable.type, 'dir'),
            inArray(cacheFileTable.path, dirsToDeleteArray)
          ));
      } catch (error) {
        console.error("Error deleting batch parent dir cache entries:", error);
      }
    }
  }

  // 6. Batch insert
  const dirsToInsert = Array.from(dirsToInsertData.values());
  if (dirsToInsert.length > 0) {
    try {
      await db.insert(cacheFileTable)
        .values(dirsToInsert)
        .onConflictDoNothing({
          target: [cacheFileTable.owner, cacheFileTable.repo, cacheFileTable.branch, cacheFileTable.path]
        });
    } catch (error) {
      console.error("Error inserting batch parent dir cache entries:", error);
    }
  }
};

// Update parent directory cache for a single file operation
const updateParentFolderCache = async (
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
  operation: 'add' | 'delete'
) => {
  const lowerOwner = owner.toLowerCase();
  const lowerRepo = repo.toLowerCase();
  const ancestors = getAncestorPaths(filePath);
  const directParent = getParentPath(filePath);
  const relevantPaths = directParent === '' ? ancestors : [directParent, ...ancestors];

  if (relevantPaths.length === 0) return; // We're at the root, no need to update

  const now = new Date();

  if (operation === 'add') {
    const dirsToInsertData = new Map<string, typeof cacheFileTable.$inferInsert>();
    for (const dirPath of relevantPaths) { // Check top-down
      if (dirsToInsertData.has(dirPath)) continue;

      const existingEntry = await db.query.cacheFileTable.findFirst({
        where: and(
          eq(cacheFileTable.owner, lowerOwner), eq(cacheFileTable.repo, lowerRepo), eq(cacheFileTable.branch, branch),
          eq(cacheFileTable.path, dirPath), eq(cacheFileTable.type, 'dir')
        ),
        columns: { id: true } // Just need existence check
      });

      if (!existingEntry) {
        const parentDir = getParentPath(dirPath);
        let context = 'collection'; // Default
        if (parentDir !== '') {
          const contextEntry = await db.query.cacheFileTable.findFirst({
            where: and(
              eq(cacheFileTable.owner, lowerOwner), eq(cacheFileTable.repo, lowerRepo), eq(cacheFileTable.branch, branch),
              eq(cacheFileTable.parentPath, parentDir)
            ),
            columns: { context: true }
          });
          if (contextEntry) {
            context = contextEntry.context;
          }
        }
        dirsToInsertData.set(dirPath, {
          context: context, owner: lowerOwner, repo: lowerRepo, branch,
          path: dirPath, parentPath: parentDir, name: path.basename(dirPath), type: 'dir', updatedAt: now,
          content: null, sha: null, size: null, downloadUrl: null, commitSha: null, commitTimestamp: null
        });
      }
    }
    const dirsToInsert = Array.from(dirsToInsertData.values());
    if (dirsToInsert.length > 0) {
      try {
        await db.insert(cacheFileTable)
          .values(dirsToInsert)
          .onConflictDoNothing({ target: [cacheFileTable.owner, cacheFileTable.repo, cacheFileTable.branch, cacheFileTable.path] });
      } catch (error) {
        console.error("Error inserting single parent dir cache entries:", error);
      }
    }

  } else {
    // Delete parent directory cache entries
    const dirPathsToDelete = new Set<string>();
    for (const dirPath of [...relevantPaths].reverse()) { // Check bottom-up
      const childrenResult = await db.select({ count: count() })
        .from(cacheFileTable)
        .where(and(
          eq(cacheFileTable.owner, lowerOwner), eq(cacheFileTable.repo, lowerRepo), eq(cacheFileTable.branch, branch),
          eq(cacheFileTable.parentPath, dirPath)
        )).limit(1);

      if (childrenResult[0]?.count === 0) {
        // Check if dir entry exists before attempting delete
        const existingEntry = await db.query.cacheFileTable.findFirst({
            where: and(
                eq(cacheFileTable.owner, lowerOwner), eq(cacheFileTable.repo, lowerRepo), eq(cacheFileTable.branch, branch),
                eq(cacheFileTable.path, dirPath), eq(cacheFileTable.type, 'dir')
            ),
            columns: { id: true }
        });
        if(existingEntry) {
             dirPathsToDelete.add(dirPath);
        }
      } else {
        break; // Not empty, parents won't be empty due to this path
      }
    }
    const dirsToDeleteArray = Array.from(dirPathsToDelete);
    if (dirsToDeleteArray.length > 0) {
      try {
        await db.delete(cacheFileTable).where(and(
          eq(cacheFileTable.owner, lowerOwner), eq(cacheFileTable.repo, lowerRepo), eq(cacheFileTable.branch, branch),
          eq(cacheFileTable.type, 'dir'),
          inArray(cacheFileTable.path, dirsToDeleteArray)
        ));
      } catch (error) {
        console.error("Error deleting single parent dir cache entries:", error);
      }
    }
  }
};

// Bulk update cache entries (removed, modified and added files)
const updateMultipleFilesCache = async (
  owner: string,
  repo: string,
  branch: string,
  removedFiles: Array<{ path: string }>,
  modifiedFiles: Array<FileChange>,
  addedFiles: Array<FileChange>,
  token: string,
  commit?: { sha: string; timestamp: number }
) => {
  const lowerOwner = owner.toLowerCase();
  const lowerRepo = repo.toLowerCase();
  const removedPaths = removedFiles.map(f => f.path);
  const addedPaths = addedFiles.map(f => f.path); // Keep track for parent update
  const changedPaths = [
    ...removedPaths,
    ...modifiedFiles.map((file) => file.path),
    ...addedPaths,
  ];
  const affectedFolderPaths = getFolderPathsForChanges(changedPaths);
  const collectionFolderPaths = new Set<string>();
  const mediaFolderPaths = new Set<string>();

  // 1. Delete removed 'file' entries in batch
  if (removedPaths.length > 0) {
    await db.delete(cacheFileTable).where(
      and(
        eq(cacheFileTable.owner, lowerOwner),
        eq(cacheFileTable.repo, lowerRepo),
        eq(cacheFileTable.branch, branch),
        eq(cacheFileTable.type, 'file'), // Only delete files here
        inArray(cacheFileTable.path, removedPaths)
      )
    );
    await invalidateFolderScopes(owner, repo, branch, affectedFolderPaths);
  }

  // 2. Collect unique non-root parent paths for changed files
  const parentPaths = Array.from(new Set([
    ...removedPaths.map((filePath) => getParentPath(filePath)),
    ...modifiedFiles.map(f => getParentPath(f.path)),
    ...addedFiles.map(f => getParentPath(f.path))
  ]));

  let pathContextMap = new Map<string, string>();
  if (parentPaths.length > 0) {
    // 3. Query existing contexts for parents
    const existingParentEntries = await db.query.cacheFileTable.findMany({
      where: and(
        eq(cacheFileTable.owner, lowerOwner),
        eq(cacheFileTable.repo, lowerRepo),
        eq(cacheFileTable.branch, branch),
        inArray(cacheFileTable.parentPath, parentPaths)
      ),
      columns: { parentPath: true, context: true }
    });

    // 4. Create parent path -> context map (prefer collection if mixed)
    for (const entry of existingParentEntries) {
      if (!pathContextMap.has(entry.parentPath) || entry.context === 'collection') {
        pathContextMap.set(entry.parentPath, entry.context);
      }
    }
  }

  for (const folderPath of affectedFolderPaths) {
    const context = pathContextMap.get(folderPath);
    if (context === "media") {
      mediaFolderPaths.add(folderPath);
    } else {
      collectionFolderPaths.add(folderPath);
    }
  }

  if (affectedFolderPaths.length > 0) {
    await Promise.all([
      collectionFolderPaths.size > 0
        ? markFolderScopesSyncing(owner, repo, branch, "collection", Array.from(collectionFolderPaths), commit)
        : Promise.resolve(),
      mediaFolderPaths.size > 0
        ? markFolderScopesSyncing(owner, repo, branch, "media", Array.from(mediaFolderPaths), commit)
        : Promise.resolve(),
    ]);
  }

  // 5. Query existing entries for modified/added files if commit info is available
  let existingFilesMap = new Map<string, typeof cacheFileTable.$inferSelect>();
  const filesToQuery = [...modifiedFiles, ...addedFiles].map(f => f.path);
  if (commit && filesToQuery.length > 0) {
    const existingFiles = await db.query.cacheFileTable.findMany({
      where: and(
        eq(cacheFileTable.owner, lowerOwner),
        eq(cacheFileTable.repo, lowerRepo),
        eq(cacheFileTable.branch, branch),
        inArray(cacheFileTable.path, filesToQuery)
      )
    });
    existingFilesMap = new Map(existingFiles.map(f => [f.path, f]));
  }

  // 6. Determine which files need fetching from GitHub API
  const filesToProcess = [...modifiedFiles, ...addedFiles].filter(file => {
    if (!commit) return true; // No commit info—process

    const existingEntry = existingFilesMap.get(file.path);
    if (!existingEntry) return true; // Doesn't exist in cache

    // Skip if cached entry is newer or same commit
    if (existingEntry.commitTimestamp && existingEntry.commitTimestamp.getTime() > commit.timestamp) return false;
    if (existingEntry.commitTimestamp && existingEntry.commitTimestamp.getTime() === commit.timestamp && existingEntry.commitSha === commit.sha) return false;

    return true; // Process otherwise
  });

  // 7. Fetch and Upsert file contents
  if (filesToProcess.length > 0) {
    const octokit = createOctokitInstance(token);
    const graphqlChunks: FileChange[][] = [];
    const CHUNK_SIZE = 50;

    for (let i = 0; i < filesToProcess.length; i += CHUNK_SIZE) {
      graphqlChunks.push(filesToProcess.slice(i, i + CHUNK_SIZE));
    }

    const upsertPromises: Promise<any>[] = [];

    for (const chunk of graphqlChunks) {
      // Batch GraphQL Query
      const query = `
        query($owner: String!, $repo: String!, ${chunk.map((_, i) => `$exp${i}: String!`).join(', ')}) {
          repository(owner: $owner, name: $repo) {
            ${chunk.map((_, i) => `
              file${i}: object(expression: $exp${i}) {
                ... on Blob { text oid byteSize }
              }
            `).join('\n')}
          }
        }`;
      const variables = {
        owner, repo,
        ...Object.fromEntries(chunk.map((file, i) => [`exp${i}`, `${branch}:${file.path}`]))
      };

      let response: any;
      try {
        response = await octokit.graphql(query, variables);
      } catch (error: any) {
        console.error(`GraphQL query failed for chunk [${chunk.map(f => f.path).join(", ")}]: ${error.message}`);
        continue;
      }

      // Prepare Upserts
      for (let i = 0; i < chunk.length; i++) {
        const file = chunk[i];
        const fileData = response.repository[`file${i}`];

        if (!fileData) {
          console.warn(`Skipping cache update for ${file.path}: File data missing from GitHub response.`);
          continue;
        }

        const parentPath = getParentPath(file.path);
        const context = parentPath === '' ? 'collection' : (pathContextMap.get(parentPath) || 'collection');
        const now = new Date();

        const entryData = {
          context, owner: lowerOwner, repo: lowerRepo, branch,
          path: file.path, parentPath, name: path.basename(file.path),
          type: 'file' as 'file' | 'dir',
          content: context === 'collection' ? fileData.text : null,
          sha: fileData.oid, size: fileData.byteSize, downloadUrl: null,
          updatedAt: now,
          commitSha: commit?.sha ?? null, commitTimestamp: commit?.timestamp ? new Date(commit.timestamp) : null
        };

        upsertPromises.push(
          db.insert(cacheFileTable)
            .values(entryData)
            .onConflictDoUpdate({
              target: [cacheFileTable.owner, cacheFileTable.repo, cacheFileTable.branch, cacheFileTable.path],
              set: { ...entryData, id: undefined } // Exclude id on update
            })
        );
      }
    }
    // Wait for all upserts to settle before updating parents
    await Promise.all(upsertPromises);
  }

  // 8. Update parent folder caches
  // Run *after* all file operations are potentially complete
  await updateParentFolderCachesBatch(owner, repo, branch, addedPaths, removedPaths);

  await Promise.all([
    collectionFolderPaths.size > 0
      ? markFolderScopesOk(owner, repo, branch, "collection", Array.from(collectionFolderPaths), commit)
      : Promise.resolve(),
    mediaFolderPaths.size > 0
      ? markFolderScopesOk(owner, repo, branch, "media", Array.from(mediaFolderPaths), commit)
      : Promise.resolve(),
  ]);
};

// Update the cache for an individual file (add, modify, delete, rename).
const updateFileCache = async (
  context: string,
  owner: string,
  repo: string,
  branch: string,
  operation: FileOperation
) => {
  const lowerOwner = owner.toLowerCase();
  const lowerRepo = repo.toLowerCase();
  const parentPath = getParentPath(operation.path);
  const folderContext = context === "media" ? "media" : "collection";
  const affectedFolderPaths = new Set<string>();
  affectedFolderPaths.add(parentPath);
  if (operation.type === "rename" && operation.newPath) {
    const renameParentPath = getParentPath(operation.newPath);
    affectedFolderPaths.add(renameParentPath);
  }

  if (affectedFolderPaths.size > 0) {
    await Promise.all(Array.from(affectedFolderPaths).map((folderPath) =>
      waitForScopeReady(owner, repo, branch, getFolderScope(folderContext, folderPath))
    ));
  }

  await markFolderScopesSyncing(
    owner,
    repo,
    branch,
    folderContext,
    Array.from(affectedFolderPaths),
    operation.commit,
  );

  try {
    switch (operation.type) {
      case 'delete':
        // Remove the specific 'file' entry
        await db.delete(cacheFileTable).where(
          and(
            eq(cacheFileTable.owner, lowerOwner), eq(cacheFileTable.repo, lowerRepo), eq(cacheFileTable.branch, branch),
            eq(cacheFileTable.type, 'file'),
            eq(cacheFileTable.path, operation.path)
          )
        );
        await updateParentFolderCache(owner, repo, branch, operation.path, 'delete');
        break;

      case 'add':
      case 'modify':
        if (operation.content === undefined || !operation.sha) {
          throw new Error('Content and SHA are required for add/modify operations');
        }

        const now = new Date();
        const entryData = {
          context, owner: lowerOwner, repo: lowerRepo, branch,
          path: operation.path, parentPath, name: path.basename(operation.path),
          type: 'file' as 'file' | 'dir',
          content: context === 'collection' ? operation.content : null,
          sha: operation.sha, size: operation.size, downloadUrl: operation.downloadUrl,
          updatedAt: now,
          commitSha: operation.commit?.sha ?? null, commitTimestamp: operation.commit?.timestamp ? new Date(operation.commit.timestamp) : null
        };

        await db.insert(cacheFileTable)
          .values(entryData)
          .onConflictDoUpdate({
            target: [cacheFileTable.owner, cacheFileTable.repo, cacheFileTable.branch, cacheFileTable.path],
            set: { ...entryData, id: undefined }
          });

        if (operation.type === 'add') {
          await updateParentFolderCache(owner, repo, branch, operation.path, 'add');
        }
        break;

      case 'rename':
        if (!operation.newPath) throw new Error('newPath is required for rename operations');

        const renameNow = new Date();
        const newParentPath = getParentPath(operation.newPath);
        const newName = path.basename(operation.newPath);

        const updateResult = await db.update(cacheFileTable)
          .set({
            path: operation.newPath,
            parentPath: newParentPath,
            name: newName,
            downloadUrl: null,
            updatedAt: renameNow,
            commitSha: operation.commit?.sha ?? null,
            commitTimestamp: operation.commit?.timestamp ? new Date(operation.commit.timestamp) : null
          })
          .where(
            and(
              eq(cacheFileTable.owner, lowerOwner), eq(cacheFileTable.repo, lowerRepo), eq(cacheFileTable.branch, branch),
              eq(cacheFileTable.path, operation.path)
            )
          ).returning({ id: cacheFileTable.id });

        if (updateResult.length > 0 && parentPath !== newParentPath) {
          await updateParentFolderCache(owner, repo, branch, operation.path, 'delete');
          await updateParentFolderCache(owner, repo, branch, operation.newPath, 'add');
        }
        break;
    }
  } catch (error: any) {
    await Promise.all(Array.from(affectedFolderPaths).map((folderPath) =>
      markFolderScopeError(
        owner,
        repo,
        branch,
        folderContext,
        folderPath,
        error?.message ? String(error.message) : "File cache update failed.",
      )
    ));
    throw error;
  }

  await markFolderScopesOk(
    owner,
    repo,
    branch,
    folderContext,
    Array.from(affectedFolderPaths),
    operation.commit,
  );
};

// Update repository name in all cache entries
const updateFileCacheRepository = async (
  owner: string,
  oldName: string,
  newName: string
) => {
  await db.update(cacheFileTable)
    .set({ repo: newName.toLowerCase() })
    .where(
      and(
        eq(cacheFileTable.owner, owner.toLowerCase()),
        eq(cacheFileTable.repo, oldName.toLowerCase())
      )
    );
};

// Update owner name in all cache entries
const updateFileCacheOwner = async (
  oldOwner: string,
  newOwner: string
) => {
  await db.update(cacheFileTable)
    .set({ owner: newOwner.toLowerCase() })
    .where(
      eq(cacheFileTable.owner, oldOwner.toLowerCase())
    );
};

// Clear file cache entries
const clearFileCache = async (
  owner: string,
  repo?: string,
  branch?: string
) => {
  const conditions = [];
  conditions.push(eq(cacheFileTable.owner, owner.toLowerCase()));
  if (repo) {
    conditions.push(eq(cacheFileTable.repo, repo.toLowerCase()));
    if (branch) conditions.push(eq(cacheFileTable.branch, branch));
  }

  await db.delete(cacheFileTable).where(and(...conditions));
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
      )
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

// Attempt to get a collection from cache, if not found, fetch from GitHub.
const getCollectionCache = async (
  owner: string,
  repo: string,
  branch: string,
  dirPath : string,
  token: string,
  nodeEntryFilename?: string
) => {
  void ensureFileCacheFreshness(owner, repo, branch, token).catch(() => {});
  const scope = getFolderScope("collection", dirPath);
  const stableMeta = await waitForScopeReady(owner, repo, branch, scope);

  // Check the cache (no context as we may invalidate media cache)
  let entries = await db.query.cacheFileTable.findMany({
    where: and(
      eq(cacheFileTable.owner, owner.toLowerCase()),
      eq(cacheFileTable.repo, repo.toLowerCase()),
      eq(cacheFileTable.branch, branch),
      eq(cacheFileTable.parentPath, dirPath)
    )
  });

  let cacheExpired = false;
  // If set to "-1", the file cache doesn't expire
  if (entries.length > 0 && !FILE_CACHE_EXPIRY_DISABLED) {
    const now = new Date();
    const ttl = parseInt(FILE_CACHE_TTL_MIN, 10) * 60 * 1000; // Defaults to 1 day cache
    cacheExpired = entries[0].updatedAt.getTime() < now.getTime() - ttl;
  }

  let octokit;
  if (stableMeta?.status === "syncing") {
    const githubEntries = await fetchCollectionDirectoryEntries(owner, repo, branch, dirPath, token);
    entries = githubEntries.map((entry: any) => ({
      context: 'collection',
      owner: owner.toLowerCase(),
      repo: repo.toLowerCase(),
      branch,
      parentPath: dirPath,
      name: entry.name,
      path: entry.path,
      type: entry.type === 'blob' ? 'file' : 'dir',
      content: entry.type === "blob" ? entry.object.text : null,
      sha: entry.type === "blob" ? entry.object.oid : null,
      size: entry.type === "blob" ? entry.object.byteSize : null,
      downloadUrl: null,
      updatedAt: new Date(),
      commitSha: null,
      commitTimestamp: null,
    }));
  }

  const hasTrustedEmptySnapshot =
    stableMeta?.status === "ok" &&
    entries.length === 0 &&
    !cacheExpired;
  const shouldRefetch =
    stableMeta?.status === "syncing" ||
    stableMeta?.status === "error" ||
    !stableMeta ||
    (!hasTrustedEmptySnapshot && entries.length === 0) ||
    cacheExpired ||
    (entries.length > 0 && entries[0].context === 'media');

  if (stableMeta?.status !== "syncing" && !hasTrustedEmptySnapshot && shouldRefetch) {
    await upsertScopedMeta(owner, repo, branch, scope, {
      status: "syncing",
      error: null,
    });

    try {
      const githubEntries = await fetchCollectionDirectoryEntries(owner, repo, branch, dirPath, token);
      const mappedEntries = githubEntries.map((entry: any) => ({
        context: 'collection',
        owner: owner.toLowerCase(),
        repo: repo.toLowerCase(),
        branch,
        parentPath: dirPath,
        name: entry.name,
        path: entry.path,
        type: entry.type === 'blob' ? 'file' : 'dir',
        content: entry.type === "blob" ? entry.object.text : null,
        sha: entry.type === "blob" ? entry.object.oid : null,
        size: entry.type === "blob" ? entry.object.byteSize : null,
        downloadUrl: null,
        updatedAt: new Date(),
        commitSha: null,
        commitTimestamp: null,
      }));

      await replaceFolderCache(owner, repo, branch, scope, mappedEntries);
      entries = mappedEntries;
    } catch (error: any) {
      await markFolderScopeError(
        owner,
        repo,
        branch,
        "collection",
        dirPath,
        error?.message ? String(error.message) : "Collection cache refresh failed.",
      );
      throw error;
    }
  }

  if (nodeEntryFilename) {
    if (!octokit) octokit = createOctokitInstance(token);

    const subdirs = entries.filter((entry: any) => entry.type === 'dir');

    if (subdirs.length > 0) {
      // Check the cache for node entries
      let nodeEntries = await db.query.cacheFileTable.findMany({
        where: and(
          eq(cacheFileTable.owner, owner.toLowerCase()),
          eq(cacheFileTable.repo, repo.toLowerCase()),
          eq(cacheFileTable.branch, branch),
          inArray(cacheFileTable.path, subdirs.map((dir: any) => `${dir.path}/${nodeEntryFilename}`))
        )
      });
      
      // Query the GitHub API for the missing node entries
      const missingSubdirs = subdirs.filter((dir: any) => !nodeEntries.some((entry: any) => entry.path === `${dir.path}/${nodeEntryFilename}`));
      
      if (missingSubdirs.length > 0) {
        const nodeEntryExpressions = missingSubdirs.map((dir: { path: string }, i: number) => ({
          alias: `nodeFile${i}`,
          expression: `${branch}:${dir.path}/${nodeEntryFilename}`
        }));
        const queryNodeEntries = `
          query ($owner: String!, $repo: String!, ${nodeEntryExpressions.map((nodeEntryExpression: any) => `$exp${nodeEntryExpression.alias}: String!`).join(', ')}) {
            repository(owner: $owner, name: $repo) {
              ${nodeEntryExpressions.map(nodeEntryExpression => `
                ${nodeEntryExpression.alias}: object(expression: $exp${nodeEntryExpression.alias}) {
                  ... on Blob {
                    text
                    oid
                    byteSize
                  }
                }
              `).join('\n')}
            }
          }
        `;
        const variablesNodeEntries = {
          owner, repo,
          ...Object.fromEntries(nodeEntryExpressions.map(nf => [`exp${nf.alias}`, nf.expression]))
        };

        const responseNodeEntries: any = await octokit.graphql(queryNodeEntries, variablesNodeEntries);
        
        for (let i = 0; i < missingSubdirs.length; i++) {
          const dir = missingSubdirs[i];
          const alias = `nodeFile${i}`;
          const nodeEntry = responseNodeEntries.repository?.[alias];
      
          if (nodeEntry) {
            nodeEntries.push({
              id: -1,
              context: '',
              owner: owner.toLowerCase(),
              repo: repo.toLowerCase(),
              branch,
              parentPath: dir.path,
              name: nodeEntryFilename,
              path: `${dir.path}/${nodeEntryFilename}`,
              type: 'file',
              content: nodeEntry.text,
              sha: nodeEntry.oid,
              size: nodeEntry.byteSize,
              downloadUrl: null,
              updatedAt: new Date(),
              commitSha: null,
              commitTimestamp: null
            });
          }
        }
      }
      if (nodeEntries.length > 0) {
        nodeEntries.forEach((entry: any) => {
          entry.isNode = true;
        });
        entries = [...entries, ...nodeEntries];
      }
    }
  }

  return entries;
}

// Attempt to get a media folder from cache, if not found, fetch from GitHub.
const getMediaCache = async (
  owner: string,
  repo: string,
  branch: string,
  path: string,
  token: string,
  nocache?: boolean
) => {
  void ensureFileCacheFreshness(owner, repo, branch, token).catch(() => {});
  const scope = getFolderScope("media", path);
  const stableMeta = nocache ? null : await waitForScopeReady(owner, repo, branch, scope);

  let entries: any[] = [];

  if (!nocache) {
    // Check for entries from either context
    entries = await db.query.cacheFileTable.findMany({
      where: and(
        eq(cacheFileTable.owner, owner.toLowerCase()),
        eq(cacheFileTable.repo, repo.toLowerCase()),
        eq(cacheFileTable.branch, branch),
        eq(cacheFileTable.parentPath, path)
      )
    });
  }

  let cacheExpired = false;
  // If set to "-1", the file cache doesn't expire
  if (entries.length > 0 && !FILE_CACHE_EXPIRY_DISABLED) {
    const now = new Date();
    const ttl = parseInt(FILE_CACHE_TTL_MIN, 10) * 60 * 1000; // Defaults to 1 day cache
    cacheExpired = entries[0].updatedAt.getTime() < now.getTime() - ttl;
  }

  if (!nocache && stableMeta?.status === "syncing") {
    const octokit = createOctokitInstance(token);
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref: branch,
    });
    if (!Array.isArray(response.data)) throw new Error("Expected a directory but found a file.");
    entries = response.data.map((entry) => ({
      context: 'media',
      owner: owner.toLowerCase(),
      repo: repo.toLowerCase(),
      branch,
      parentPath: path,
      name: entry.name,
      path: entry.path,
      type: entry.type,
      content: null,
      sha: entry.sha,
      size: entry.size || null,
      downloadUrl: entry.download_url || null,
      updatedAt: new Date(),
      commitSha: null,
      commitTimestamp: null,
    }));
  }

  const hasTrustedEmptySnapshot =
    !nocache &&
    stableMeta?.status === "ok" &&
    entries.length === 0 &&
    !cacheExpired;
  const shouldRefetch =
    nocache ||
    stableMeta?.status === "syncing" ||
    stableMeta?.status === "error" ||
    !stableMeta ||
    (!hasTrustedEmptySnapshot && entries.length === 0) ||
    cacheExpired;

  if ((nocache || stableMeta?.status !== "syncing") && !hasTrustedEmptySnapshot && shouldRefetch) {
    try {
      const octokit = createOctokitInstance(token);
      const response = await octokit.rest.repos.getContent({
        owner: owner,
        repo: repo,
        path: path,
        ref: branch,
      });

      if (!Array.isArray(response.data)) throw new Error("Expected a directory but found a file.");

      const githubEntries = response.data;

      const mappedEntries = githubEntries.map(entry => ({
        context: 'media',
        owner: owner.toLowerCase(),
        repo: repo.toLowerCase(),
        branch,
        parentPath: path,
        name: entry.name,
        path: entry.path,
        type: entry.type,
        content: null,
        sha: entry.sha,
        size: entry.size || null,
        downloadUrl: entry.download_url || null,
        updatedAt: new Date(),
        commitSha: null,
        commitTimestamp: null
      }));

      if (!nocache) {
        await upsertScopedMeta(owner, repo, branch, scope, {
          status: "syncing",
          error: null,
        });
        await replaceFolderCache(owner, repo, branch, scope, mappedEntries);
        entries = mappedEntries;
      } else {
        entries = mappedEntries;
      }
    } catch (error: any) {
      if (!nocache) {
        await markFolderScopeError(
          owner,
          repo,
          branch,
          "media",
          path,
          error?.message ? String(error.message) : "Media cache refresh failed.",
        );
      }
      throw error;
    }
  }

  return entries;
};

// Check if a user has access to a repository (with caching)
const checkRepoAccess = async (
  token: string,
  owner: string,
  repo: string,
  githubId: number
): Promise<boolean> => {
  // Check if we have a cached result
  const now = new Date();
  const ttl = parseInt(PERMISSIONS_CACHE_TTL_MIN, 10) * 60 * 1000;

  const cacheEntry = await db.query.cachePermissionTable.findFirst({
    where: and(
      eq(cachePermissionTable.githubId, githubId),
      eq(cachePermissionTable.owner, owner.toLowerCase()),
      eq(cachePermissionTable.repo, repo.toLowerCase()),
      gt(cachePermissionTable.lastUpdated, new Date(now.getTime() - ttl))
    )
  });

  if (cacheEntry) return true;

  // Not in cache, check with API
  try {
    const octokit = createOctokitInstance(token);
    const response = await octokit.rest.repos.get({ owner, repo });
    // If successful, cache the result
    if (response.status === 200) {
      await db.insert(cachePermissionTable)
        .values({
          githubId,
          owner: owner.toLowerCase(),
          repo: repo.toLowerCase(),
          lastUpdated: new Date()
        })
        .onConflictDoUpdate({
          target: [
            cachePermissionTable.githubId,
            cachePermissionTable.owner,
            cachePermissionTable.repo
          ],
          set: { lastUpdated: new Date() }
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

export {
  getBranchHeadSha,
  setBranchHeadSha,
  getRepoSnapshot,
  updateMultipleFilesCache,
  updateFileCache,
  updateFileCacheRepository,
  updateFileCacheOwner,
  clearFileCache,
  clearPermissionCache,
  getCollectionCache,
  getMediaCache,
  checkRepoAccess,
  ensureFileCacheFreshness,
};
