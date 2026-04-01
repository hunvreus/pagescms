/**
 * Manage cached GitHub repository snapshots, branch heads, and file/media trees.
 */

import { db } from "@/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { cacheFileMetaTable, cacheFileTable } from "@/db/schema";
import { createOctokitInstance } from "@/lib/utils/octokit";
import { getParentPath } from "@/lib/utils/file";
import { getCacheFileMeta, upsertCacheFileMeta } from "@/lib/github-cache-meta";
import {
  BRANCH_CACHE_SCOPE,
  getCacheFileMetaKey,
  claimFolderScopes,
  fetchCollectionDirectoryEntries,
  fetchMediaDirectoryEntries,
  getFolderPathsForChanges,
  getFolderScope,
  invalidateFolderScopes,
  markFolderScopeError,
  replaceFolderCache,
  upsertScopedMeta,
  waitForScopeAndBranchMeta,
} from "@/lib/github-cache-folders";
import { Repo } from "@/types/repo";
import path from "path";

type FileChange = {
  path: string;
  sha: string;
};

type BranchHeadInfo = {
  sha: string;
  timestamp: number;
};

type BranchHeadCacheEntry = {
  sha: string;
  timestamp: number;
  expiresAt: number;
};

type RepoSnapshotCacheEntry = {
  value: Repo;
  expiresAt: number;
};

const BRANCH_HEAD_TTL_MS = parseInt(process.env.BRANCH_HEAD_TTL_MS || "15000", 10);
const REPO_META_TTL_MS = parseInt(process.env.REPO_META_TTL_MS || "15000", 10);
const CACHE_RECONCILE_INTERVAL_MIN = process.env.CACHE_CHECK_MIN || "5";
const FILE_CACHE_TTL_MIN = process.env.FILE_TTL_MIN || "1440";
const FILE_CACHE_EXPIRY_DISABLED = FILE_CACHE_TTL_MIN === "-1";
const branchHeadCache = new Map<string, BranchHeadCacheEntry>();
const branchHeadInFlight = new Map<string, Promise<BranchHeadInfo>>();
const repoSnapshotCache = new Map<string, RepoSnapshotCacheEntry>();
const repoSnapshotInFlight = new Map<string, Promise<Repo>>();

const getBranchHeadCacheKey = (owner: string, repo: string, branch: string) =>
  `${owner.toLowerCase()}::${repo.toLowerCase()}::${branch}`;

const getRepoSnapshotCacheKey = (owner: string, repo: string) =>
  `${owner.toLowerCase()}::${repo.toLowerCase()}`;

const setBranchHeadInfo = (
  owner: string,
  repo: string,
  branch: string,
  info: BranchHeadInfo,
) => {
  const key = getBranchHeadCacheKey(owner, repo, branch);
  branchHeadCache.set(key, {
    sha: info.sha,
    timestamp: info.timestamp,
    expiresAt: Date.now() + BRANCH_HEAD_TTL_MS,
  });
};

const getBranchHeadInfo = async (
  owner: string,
  repo: string,
  branch: string,
  token: string,
  options?: { force?: boolean },
): Promise<BranchHeadInfo> => {
  const key = getBranchHeadCacheKey(owner, repo, branch);

  if (!options?.force) {
    const cached = branchHeadCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        sha: cached.sha,
        timestamp: cached.timestamp,
      };
    }
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
    const timestampValue =
      response.data.commit.commit?.committer?.date ??
      response.data.commit.commit?.author?.date ??
      null;
    const parsedTimestamp = timestampValue ? Date.parse(timestampValue) : Number.NaN;
    const info = {
      sha: response.data.commit.sha,
      timestamp: Number.isNaN(parsedTimestamp) ? Date.now() : parsedTimestamp,
    };
    setBranchHeadInfo(owner, repo, branch, info);
    return info;
  })();

  branchHeadInFlight.set(key, job);
  try {
    return await job;
  } finally {
    branchHeadInFlight.delete(key);
  }
};

const getBranchHeadSha = async (
  owner: string,
  repo: string,
  branch: string,
  token: string,
  options?: { force?: boolean },
): Promise<string> => {
  const info = await getBranchHeadInfo(owner, repo, branch, token, options);
  return info.sha;
};

const setBranchHeadSha = (
  owner: string,
  repo: string,
  branch: string,
  sha: string,
) => {
  setBranchHeadInfo(owner, repo, branch, {
    sha,
    timestamp: Date.now(),
  });
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

type FolderContext = "collection" | "media";
type CacheMetaLike = {
  status?: string | null;
  commitSha?: string | null;
} | null | undefined;

const cacheFileReconcileInFlight = new Map<string, Promise<void>>();
const cacheFileCheckTTLms = parseInt(CACHE_RECONCILE_INTERVAL_MIN, 10) * 60 * 1000;

const reconcileFileCache = async (
  owner: string,
  repo: string,
  branch: string,
  token: string,
) => {
  const key = getCacheFileMetaKey(owner, repo, branch);
  if (cacheFileReconcileInFlight.has(key)) {
    return cacheFileReconcileInFlight.get(key)!;
  }

  const job = (async () => {
    try {
      const head = await getBranchHeadInfo(owner, repo, branch, token);

      await upsertCacheFileMeta(owner, repo, branch, {
        path: BRANCH_CACHE_SCOPE.path,
        context: BRANCH_CACHE_SCOPE.context,
        commitSha: head.sha,
        commitTimestamp: new Date(head.timestamp),
        status: "ok",
        error: null,
      });
    } catch (error: any) {
      await upsertCacheFileMeta(owner, repo, branch, {
        path: BRANCH_CACHE_SCOPE.path,
        context: BRANCH_CACHE_SCOPE.context,
        status: "error",
        error: error?.message ? String(error.message) : "Cache reconcile failed.",
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

const getDirectFolderPaths = (filePaths: string[]) =>
  Array.from(new Set(filePaths.map((filePath) => getParentPath(filePath))));

const getVerifiedDirectFolderContexts = async (
  owner: string,
  repo: string,
  branch: string,
  folderPaths: string[],
): Promise<Map<string, FolderContext>> => {
  const uniqueFolderPaths = Array.from(new Set(folderPaths));
  if (uniqueFolderPaths.length === 0) return new Map();

  const metas = await db.query.cacheFileMetaTable.findMany({
    where: and(
      sql`lower(${cacheFileMetaTable.owner}) = lower(${owner})`,
      sql`lower(${cacheFileMetaTable.repo}) = lower(${repo})`,
      eq(cacheFileMetaTable.branch, branch),
      inArray(cacheFileMetaTable.path, uniqueFolderPaths),
      inArray(cacheFileMetaTable.context, ["collection", "media"]),
      eq(cacheFileMetaTable.status, "ok"),
      sql`${cacheFileMetaTable.commitSha} is not null`,
    ),
    columns: {
      path: true,
      context: true,
    },
  });

  const contextMap = new Map<string, FolderContext>();
  for (const meta of metas) {
    if (meta.context === "collection" || meta.context === "media") {
      contextMap.set(meta.path, meta.context);
    }
  }

  return contextMap;
};

const finalizePatchedFolderMetas = async (
  owner: string,
  repo: string,
  branch: string,
  contextByPath: Map<string, FolderContext>,
  commit: { sha: string; timestamp: number } | undefined,
  failedPaths: Set<string>,
) => {
  if (!commit || contextByPath.size === 0) return new Set<string>();

  const candidatePaths = Array.from(contextByPath.keys()).filter((folderPath) => !failedPaths.has(folderPath));
  if (candidatePaths.length === 0) return new Set<string>();

  const remainingRows = await db
    .selectDistinct({ parentPath: cacheFileTable.parentPath })
    .from(cacheFileTable)
    .where(
      and(
        eq(cacheFileTable.owner, owner.toLowerCase()),
        eq(cacheFileTable.repo, repo.toLowerCase()),
        eq(cacheFileTable.branch, branch),
        inArray(cacheFileTable.parentPath, candidatePaths),
      ),
    );

  const nonEmptyPaths = new Set(remainingRows.map((row) => row.parentPath));
  const keptPaths = candidatePaths.filter((folderPath) => nonEmptyPaths.has(folderPath));

  await Promise.all(
    keptPaths.map((folderPath) =>
      upsertScopedMeta(owner, repo, branch, getFolderScope(contextByPath.get(folderPath)!, folderPath), {
        commitSha: commit.sha,
        commitTimestamp: new Date(commit.timestamp),
        status: "ok",
        error: null,
      }),
    ),
  );

  return new Set(keptPaths);
};

const setBranchCacheToCommit = async (
  owner: string,
  repo: string,
  branch: string,
  commit?: { sha: string; timestamp: number },
) => {
  if (!commit) return;

  await upsertCacheFileMeta(owner, repo, branch, {
    path: BRANCH_CACHE_SCOPE.path,
    context: BRANCH_CACHE_SCOPE.context,
    commitSha: commit.sha,
    commitTimestamp: new Date(commit.timestamp),
    status: "ok",
    error: null,
  });
};

const hasVerifiedFolderSnapshot = (
  scopeMeta: CacheMetaLike,
  branchMeta?: CacheMetaLike,
) =>
  scopeMeta?.status === "ok" &&
  !!scopeMeta.commitSha &&
  (!branchMeta?.commitSha || scopeMeta.commitSha === branchMeta.commitSha);


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
  const addedPaths = addedFiles.map(f => f.path);
  const changedPaths = [
    ...removedPaths,
    ...modifiedFiles.map((file) => file.path),
    ...addedPaths,
  ];
  const affectedFolderPaths = getFolderPathsForChanges(changedPaths);
  const directFolderPaths = getDirectFolderPaths(changedPaths);
  const verifiedDirectFolderContexts = commit
    ? await getVerifiedDirectFolderContexts(owner, repo, branch, directFolderPaths)
    : new Map<string, FolderContext>();
  const verifiedDirectFolderPaths = Array.from(verifiedDirectFolderContexts.keys());
  const collectionFolderPaths = verifiedDirectFolderPaths.filter(
    (folderPath) => verifiedDirectFolderContexts.get(folderPath) === "collection",
  );
  const mediaFolderPaths = verifiedDirectFolderPaths.filter(
    (folderPath) => verifiedDirectFolderContexts.get(folderPath) === "media",
  );
  const failedDirectFolderPaths = new Set<string>();

  if (verifiedDirectFolderPaths.length > 0) {
    const [claimedCollection, claimedMedia] = await Promise.all([
      collectionFolderPaths.length > 0
        ? claimFolderScopes(owner, repo, branch, "collection", collectionFolderPaths)
        : Promise.resolve(true),
      mediaFolderPaths.length > 0
        ? claimFolderScopes(owner, repo, branch, "media", mediaFolderPaths)
        : Promise.resolve(true),
    ]);

    if (!claimedCollection || !claimedMedia) {
      await invalidateFolderScopes(owner, repo, branch, affectedFolderPaths);
      return;
    }
  }

  // 1. Delete removed 'file' entries in batch for verified folders only.
  const removedPathsToPatch = removedPaths.filter((filePath) =>
    verifiedDirectFolderContexts.has(getParentPath(filePath)),
  );
  if (removedPathsToPatch.length > 0) {
    await db.delete(cacheFileTable).where(
      and(
        eq(cacheFileTable.owner, lowerOwner),
        eq(cacheFileTable.repo, lowerRepo),
        eq(cacheFileTable.branch, branch),
        eq(cacheFileTable.type, 'file'),
        inArray(cacheFileTable.path, removedPathsToPatch)
      )
    );
  }

  // 2. Query existing entries for modified/added files if commit info is available
  let existingFilesMap = new Map<string, typeof cacheFileTable.$inferSelect>();
  const filesToQuery = [...modifiedFiles, ...addedFiles]
    .map((file) => file.path)
    .filter((filePath) => verifiedDirectFolderContexts.has(getParentPath(filePath)));
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

  // 3. Determine which files need fetching from GitHub API
  const filesToProcess = [...modifiedFiles, ...addedFiles].filter(file => {
    if (!verifiedDirectFolderContexts.has(getParentPath(file.path))) return false;
    if (!commit) return true; // No commit info—process

    const existingEntry = existingFilesMap.get(file.path);
    if (!existingEntry) return true; // Doesn't exist in cache

    // Skip if cached entry is newer or same commit
    if (existingEntry.commitTimestamp && existingEntry.commitTimestamp.getTime() > commit.timestamp) return false;
    if (existingEntry.commitTimestamp && existingEntry.commitTimestamp.getTime() === commit.timestamp && existingEntry.commitSha === commit.sha) return false;

    return true; // Process otherwise
  });

  // 4. Fetch and Upsert file contents for verified folders only.
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
        chunk.forEach((file) => failedDirectFolderPaths.add(getParentPath(file.path)));
        continue;
      }

      // Prepare Upserts
      for (let i = 0; i < chunk.length; i++) {
        const file = chunk[i];
        const fileData = response.repository[`file${i}`];

        if (!fileData) {
          console.warn(`Skipping cache update for ${file.path}: File data missing from GitHub response.`);
          failedDirectFolderPaths.add(getParentPath(file.path));
          continue;
        }

        const parentPath = getParentPath(file.path);
        const context = verifiedDirectFolderContexts.get(parentPath) ?? 'collection';
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

  const preservedDirectFolderPaths = await finalizePatchedFolderMetas(
    owner,
    repo,
    branch,
    verifiedDirectFolderContexts,
    commit,
    failedDirectFolderPaths,
  );

  await setBranchCacheToCommit(owner, repo, branch, commit);

  const invalidatedPaths = affectedFolderPaths.filter(
    (folderPath) => !preservedDirectFolderPaths.has(folderPath),
  );

  if (invalidatedPaths.length > 0) {
    await invalidateFolderScopes(owner, repo, branch, invalidatedPaths);
  }
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
  const folderContext = context === "media" ? "media" : "collection";
  const changedPaths = operation.type === "rename" && operation.newPath
    ? [operation.path, operation.newPath]
    : [operation.path];
  const affectedFolderPaths = getFolderPathsForChanges(changedPaths);
  const parentPath = getParentPath(operation.path);
  const newParentPath = operation.type === "rename" && operation.newPath
    ? getParentPath(operation.newPath)
    : parentPath;
  const directFolderPaths = Array.from(new Set([parentPath, newParentPath]));
  const verifiedDirectFolderContexts = operation.commit
    ? await getVerifiedDirectFolderContexts(owner, repo, branch, directFolderPaths)
    : new Map<string, FolderContext>();
  const preservedDirectFolderPaths = new Set<string>();
  const failedDirectFolderPaths = new Set<string>();
  const shouldPreserveSingleFolder = operation.commit && verifiedDirectFolderContexts.has(parentPath);
  const shouldPreserveRename =
    operation.type === "rename" &&
    operation.commit &&
    parentPath === newParentPath &&
    verifiedDirectFolderContexts.has(parentPath);

  const foldersToClaim =
    operation.type === "rename"
      ? (shouldPreserveRename ? [parentPath] : [])
      : (shouldPreserveSingleFolder ? [parentPath] : []);

  if (foldersToClaim.length > 0) {
    const claimed = await claimFolderScopes(
      owner,
      repo,
      branch,
      folderContext,
      foldersToClaim,
    );
    if (!claimed) {
      await invalidateFolderScopes(owner, repo, branch, affectedFolderPaths);
      return;
    }
  }

  try {
    switch (operation.type) {
      case 'delete':
        if (shouldPreserveSingleFolder) {
          await db.delete(cacheFileTable).where(
            and(
              eq(cacheFileTable.owner, lowerOwner), eq(cacheFileTable.repo, lowerRepo), eq(cacheFileTable.branch, branch),
              eq(cacheFileTable.type, 'file'),
              eq(cacheFileTable.path, operation.path)
            )
          );
        }
        break;

      case 'add':
      case 'modify':
        if (operation.content === undefined || !operation.sha) {
          throw new Error('Content and SHA are required for add/modify operations');
        }

        if (shouldPreserveSingleFolder) {
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
        }
        break;

      case 'rename':
        if (!operation.newPath) throw new Error('newPath is required for rename operations');

        if (shouldPreserveRename) {
          const renameNow = new Date();
          const newName = path.basename(operation.newPath);

          await db.update(cacheFileTable)
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
            );
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

  if (foldersToClaim.length > 0) {
    const keptPaths = await finalizePatchedFolderMetas(
      owner,
      repo,
      branch,
      verifiedDirectFolderContexts,
      operation.commit,
      failedDirectFolderPaths,
    );
    keptPaths.forEach((folderPath) => preservedDirectFolderPaths.add(folderPath));
  }

  await setBranchCacheToCommit(owner, repo, branch, operation.commit);

  if (affectedFolderPaths.length > 0) {
    const invalidatedPaths = affectedFolderPaths.filter(
      (folderPath) => !preservedDirectFolderPaths.has(folderPath),
    );
    if (invalidatedPaths.length > 0) {
      await invalidateFolderScopes(owner, repo, branch, invalidatedPaths);
    }
  }
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
  const { scopeMeta: stableMeta, branchMeta } = await waitForScopeAndBranchMeta(
    owner,
    repo,
    branch,
    scope,
  );
  const hasVerifiedSnapshot = hasVerifiedFolderSnapshot(stableMeta, branchMeta);

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

  const shouldRefetch =
    stableMeta?.status === "syncing" ||
    stableMeta?.status === "error" ||
    !hasVerifiedSnapshot ||
    !stableMeta ||
    entries.length === 0 ||
    cacheExpired ||
    (entries.length > 0 && entries[0].context === 'media');

  if (stableMeta?.status !== "syncing" && shouldRefetch) {
    await upsertScopedMeta(owner, repo, branch, scope, {
      status: "syncing",
      error: null,
    });

    try {
      const head = await getBranchHeadInfo(owner, repo, branch, token);
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
        commitSha: head.sha,
        commitTimestamp: new Date(head.timestamp),
      }));

      await replaceFolderCache(owner, repo, branch, scope, mappedEntries, head);
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
  const metaState = nocache
    ? { scopeMeta: null, branchMeta: null }
    : await waitForScopeAndBranchMeta(owner, repo, branch, scope);
  const stableMeta = metaState.scopeMeta;
  const branchMeta = metaState.branchMeta;
  const hasVerifiedSnapshot = !!nocache || hasVerifiedFolderSnapshot(stableMeta, branchMeta);

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
    const githubEntries = await fetchMediaDirectoryEntries(owner, repo, branch, path, token);
    entries = githubEntries.map((entry) => ({
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

  const shouldRefetch =
    nocache ||
    stableMeta?.status === "syncing" ||
    stableMeta?.status === "error" ||
    (!nocache && !hasVerifiedSnapshot) ||
    !stableMeta ||
    entries.length === 0 ||
    cacheExpired;

  if ((nocache || stableMeta?.status !== "syncing") && shouldRefetch) {
    try {
      const head = await getBranchHeadInfo(owner, repo, branch, token);
      const githubEntries = await fetchMediaDirectoryEntries(owner, repo, branch, path, token);

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
        commitSha: head.sha,
        commitTimestamp: new Date(head.timestamp)
      }));

      if (!nocache) {
        await upsertScopedMeta(owner, repo, branch, scope, {
          status: "syncing",
          error: null,
        });
        await replaceFolderCache(owner, repo, branch, scope, mappedEntries, head);
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

export {
  getBranchHeadInfo,
  getBranchHeadSha,
  setBranchHeadSha,
  getRepoSnapshot,
  updateMultipleFilesCache,
  updateFileCache,
  updateFileCacheRepository,
  updateFileCacheOwner,
  clearFileCache,
  getCollectionCache,
  getMediaCache,
  ensureFileCacheFreshness,
};
