/**
 * Helper functions to manage the database cache.
 */

import { db } from "@/db";
import { eq, and, inArray, gt } from "drizzle-orm";
import { cacheFileTable, cachePermissionTable } from "@/db/schema";
import { createOctokitInstance } from "@/lib/utils/octokit";
import path from "path";

type FileChange = {
  path: string;
  sha: string;
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

type CacheContext = 'collection' | 'media';

// Bulk update cache entries (removed, modified and added files).
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
  // 1. Delete removed files in batch
  if (removedFiles.length > 0) {
    await db.delete(cacheFileTable).where(
      and(
        eq(cacheFileTable.owner, owner),
        eq(cacheFileTable.repo, repo),
        eq(cacheFileTable.branch, branch),
        inArray(cacheFileTable.path, removedFiles.map(f => f.path))
      )
    );
  }

  // 2. Collect unique parent paths for added/modified files
  const parentPaths = Array.from(new Set([
    ...modifiedFiles.map(f => path.dirname(f.path)),
    ...addedFiles.map(f => path.dirname(f.path))
  ]));

  if (parentPaths.length === 0) return;

  // 3. Query existing contexts (combined single query)
  const existingEntries = await db.query.cacheFileTable.findMany({
    where: and(
      eq(cacheFileTable.owner, owner),
      eq(cacheFileTable.repo, repo),
      eq(cacheFileTable.branch, branch),
      inArray(cacheFileTable.parentPath, parentPaths)
    )
  });

  // 4. Create parent path -> context map
  const pathContextMap = new Map<string, CacheContext>();
  for (const entry of existingEntries) {
    if (entry.context === 'collection') {
      pathContextMap.set(entry.parentPath, 'collection');
    } else if (!pathContextMap.has(entry.parentPath)) {
      pathContextMap.set(entry.parentPath, 'media');
    }
  }

  // 5. Query existing entries for modified/added files if commit provided
  let existingFilesMap = new Map<string, typeof cacheFileTable.$inferSelect>();
  if (commit) {
    const allPaths = [...modifiedFiles, ...addedFiles].map(f => f.path);
    const existingFiles = await db.query.cacheFileTable.findMany({
      where: and(
        eq(cacheFileTable.owner, owner),
        eq(cacheFileTable.repo, repo),
        eq(cacheFileTable.branch, branch),
        inArray(cacheFileTable.path, allPaths)
      )
    });

    existingFilesMap = new Map(existingFiles.map(f => [f.path, f]));
  }

  // 6. Determine which files need processing
  const filesToProcess = [...modifiedFiles, ...addedFiles].filter(file => {
    const parentPath = path.dirname(file.path);
    if (!pathContextMap.has(parentPath)) return false;

    if (!commit) return true; // No commit info—process

    const existingEntry = existingFilesMap.get(file.path);
    if (!existingEntry) return true;

    if (existingEntry.commitTimestamp && existingEntry.commitTimestamp > commit.timestamp) {
      return false;
    }

    if (existingEntry.commitTimestamp === commit.timestamp &&
        existingEntry.commitSha === commit.sha) {
      return false;
    }

    return true;
  });

  if (filesToProcess.length === 0) return;

  // 7. Fetch file contents via GitHub GraphQL API
  const octokit = createOctokitInstance(token);
  const graphqlChunks = [];
  const CHUNK_SIZE = 50; // Prevent hitting GitHub limits

  for (let i = 0; i < filesToProcess.length; i += CHUNK_SIZE) {
    graphqlChunks.push(filesToProcess.slice(i, i + CHUNK_SIZE));
  }

  for (const chunk of graphqlChunks) {
    const query = `
      query($owner: String!, $repo: String!, ${chunk.map((_, i) => `$exp${i}: String!`).join(', ')}) {
        repository(owner: $owner, name: $repo) {
          ${chunk.map((_, i) => `
            file${i}: object(expression: $exp${i}) {
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

    const variables = {
      owner,
      repo,
      ...Object.fromEntries(chunk.map((file, i) => [`exp${i}`, `${branch}:${file.path}`]))
    };

    let response: any;
    try {
      response = await octokit.graphql(query, variables);
    } catch (error: any) {
      console.error(`GraphQL query failed for chunk containing files [${chunk.map(f => f.path).join(", ")}]: ${error.message}`);
      continue; // Skip this chunk and move to the next
    }

    // 8. Process responses sequentially
    for (let i = 0; i < chunk.length; i++) {
      const file = chunk[i];
      const fileData = response.repository[`file${i}`];

      if (!fileData) {
        console.warn(`Skipping cache update for ${file.path}: File data missing from GitHub response.`);
        continue; // Skip this individual file
      }

      const parentPath = path.dirname(file.path);
      const context = pathContextMap.get(parentPath)!;
      const existingEntry = existingFilesMap.get(file.path);
      const now = Date.now();

      const entryData = {
        context,
        owner,
        repo,
        branch,
        path: file.path,
        parentPath,
        name: path.basename(file.path),
        type: 'file',
        content: context === 'collection' ? fileData.text : null,
        sha: fileData.oid,
        size: fileData.byteSize,
        downloadUrl: null,
        lastUpdated: now,
        commitSha: commit?.sha ?? null,
        commitTimestamp: commit?.timestamp ?? null
      };

      if (existingEntry) {
        await db.update(cacheFileTable)
          .set(entryData)
          .where(eq(cacheFileTable.id, existingEntry.id));
      } else {
        await db.insert(cacheFileTable).values(entryData);
      }
    }
  }
};

// Update the cache for an individual file (add, modify and delete).
const updateFileCache = async (
  context: CacheContext,
  owner: string,
  repo: string,
  branch: string,
  operation: FileOperation
) => {
  const parentPath = path.dirname(operation.path);

  switch (operation.type) {
    case 'delete':
      // We always remove entries from the cache when the file is deleted
      await db.delete(cacheFileTable).where(
        and(
          eq(cacheFileTable.owner, owner),
          eq(cacheFileTable.repo, repo),
          eq(cacheFileTable.branch, branch),
          eq(cacheFileTable.path, operation.path)
        )
      );
      break;

    case 'add':
    case 'modify':
      if (operation.content === undefined || !operation.sha) {
        throw new Error('Content and SHA are required for add/modify operations');
      }

      if (operation.type === 'modify') {
        // We always update entries in the cache if they are already present
        await db.update(cacheFileTable)
          .set({
            content: operation.content,
            sha: operation.sha,
            size: operation.size,
            downloadUrl: operation.downloadUrl,
            lastUpdated: Date.now(),
            ...(operation.commit ? {
              commitSha: operation.commit.sha,
              commitTimestamp: operation.commit.timestamp
            } : {})
          })
          .where(
            and(
              eq(cacheFileTable.context, context),
              eq(cacheFileTable.owner, owner),
              eq(cacheFileTable.repo, repo),
              eq(cacheFileTable.branch, branch),
              eq(cacheFileTable.path, operation.path)
            )
          );
      } else {
        // We only cache collections and media folders. We only add files that already
        // have siblings in the cache. If not we can assume the collection or media
        // folder hasn't been cached yet, so we skip to avoid caching a single file.
        const sibling = await db.query.cacheFileTable.findFirst({
          where: and(
            eq(cacheFileTable.context, context),
            eq(cacheFileTable.owner, owner),
            eq(cacheFileTable.repo, repo),
            eq(cacheFileTable.branch, branch),
            eq(cacheFileTable.parentPath, parentPath)
          )
        });

        if (sibling) {
          await db.insert(cacheFileTable)
            .values({
              context,
              owner,
              repo,
              branch,
              path: operation.path,
              parentPath,
              name: path.basename(operation.path),
              type: 'file',
              content: operation.content,
              sha: operation.sha,
              size: operation.size,
              downloadUrl: operation.downloadUrl,
              lastUpdated: Date.now(),
              ...(operation.commit ? {
                commitSha: operation.commit.sha,
                commitTimestamp: operation.commit.timestamp
              } : {})
            });
        }
      }
      break;

    case 'rename':
      if (!operation.newPath) {
        throw new Error('newPath is required for rename operations');
      }
      
      await db.update(cacheFileTable)
        .set({
          path: operation.newPath,
          parentPath: path.dirname(operation.newPath),
          name: path.basename(operation.newPath),
          downloadUrl: null, // Reset download URL as it will change with the new path
          lastUpdated: Date.now(),
          ...(operation.commit ? {
            commitSha: operation.commit.sha,
            commitTimestamp: operation.commit.timestamp
          } : {})
        })
        .where(
          and(
            eq(cacheFileTable.owner, owner),
            eq(cacheFileTable.repo, repo),
            eq(cacheFileTable.branch, branch),
            eq(cacheFileTable.path, operation.path)
          )
        );
      break;
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
  path: string,
  token: string
) => {
  // Check the cache (no context as we may invalidate media cache)
  let entries = await db.query.cacheFileTable.findMany({
    where: and(
      eq(cacheFileTable.owner, owner),
      eq(cacheFileTable.repo, repo),
      eq(cacheFileTable.branch, branch),
      eq(cacheFileTable.parentPath, path)
    )
  });

  let cacheExpired = false;
  // If set to "-1", the file cache doesn't expire
  if (entries.length > 0 && process.env.FILE_CACHE_TTL !== "-1") {
    const now = Date.now();
    const ttl = parseInt(process.env.FILE_CACHE_TTL || "10080") * 60 * 1000; // Defaults to 7 days cache
    cacheExpired = entries[0].lastUpdated < now - ttl;
  }

  if (entries.length === 0 || cacheExpired || (entries.length > 0 && entries[0].context === 'media')) {
    if (cacheExpired || (entries.length > 0 && entries[0].context === 'media')) {
      // Drop the cache, either because it expired or because we're replacing media
      // cache with collection cache.
      await db.delete(cacheFileTable).where(
        and(
          eq(cacheFileTable.owner, owner),
          eq(cacheFileTable.repo, repo),
          eq(cacheFileTable.branch, branch),
          eq(cacheFileTable.parentPath, path),
        )
      );
    }
    
    // Fetch from GitHub to create the collection cache
    const octokit = createOctokitInstance(token);
    const query = `
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
    const expression = `${branch}:${path}`;
    const response: any = await octokit.graphql(query, {
      owner: owner,
      repo: repo,
      expression
    });
    
    let githubEntries = response.repository?.object?.entries || [];

    if (githubEntries.length > 0) {
      // We populate the cache
      entries = await db.insert(cacheFileTable)
        .values(githubEntries.map((entry: any) => ({
          context: 'collection',
          owner,
          repo,
          branch,
          parentPath: path,
          name: entry.name,
          path: entry.path,
          type: entry.type === 'blob' ? 'file' : 'dir',
          content: entry.type === "blob" ? entry.object.text : null,
          sha: entry.type === "blob" ? entry.object.oid : null,
          size: entry.type === "blob" ? entry.object.byteSize : null,
          downloadUrl: null, // GraphQL doesn't return download URLs (and we don't need it for collections)
          lastUpdated: Date.now()
        })))
        .returning();
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
  let entries: any[] = [];

  if (!nocache) {
    // Check for entries from either context
    entries = await db.query.cacheFileTable.findMany({
      where: and(
        eq(cacheFileTable.owner, owner),
        eq(cacheFileTable.repo, repo),
        eq(cacheFileTable.branch, branch),
        eq(cacheFileTable.parentPath, path)
      )
    });
  }

  let cacheExpired = false;
  // If set to "-1", the file cache doesn't expire
  if (entries.length > 0 && process.env.FILE_CACHE_TTL !== "-1") {
    const now = Date.now();
    const ttl = parseInt(process.env.FILE_CACHE_TTL || "10080") * 60 * 1000; // Defaults to 7 days cache
    cacheExpired = entries[0].lastUpdated < now - ttl;
  }
  
  if (entries.length === 0 || cacheExpired) {  
    // Drop the cache as it expired
    if (cacheExpired) {
      // Drop expired cache
      await db.delete(cacheFileTable).where(
        and(
          eq(cacheFileTable.owner, owner),
          eq(cacheFileTable.repo, repo),
          eq(cacheFileTable.branch, branch),
          eq(cacheFileTable.parentPath, path),
        )
      );
    }

    // No cache hit, fetch from GitHub
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
      context: 'media' as CacheContext,
      owner,
      repo,
      branch,
      parentPath: path,
      name: entry.name,
      path: entry.path,
      type: entry.type,
      content: null,
      sha: entry.sha,
      size: entry.size || null,
      downloadUrl: entry.download_url || null,
      lastUpdated: Date.now(),
      commitSha: null,
      commitTimestamp: null
    }));

    if (!nocache && githubEntries.length > 0) {
      // Cache the entries
      entries = await db.insert(cacheFileTable)
        .values(mappedEntries)
        .returning();
    } else {
      // When `nocache`, we don't cache the entries (used by ./lib/githubImage.ts
      // to get fresh download_url from GitHub and avoid hammering the cache table).
      entries = mappedEntries;
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
  const now = Date.now();
  const ttl = parseInt(process.env.PERMISSION_CACHE_TTL || "60") * 60 * 1000;
  
  const cacheEntry = await db.query.cachePermissionTable.findFirst({
    where: and(
      eq(cachePermissionTable.githubId, githubId),
      eq(cachePermissionTable.owner, owner.toLowerCase()),
      eq(cachePermissionTable.repo, repo.toLowerCase()),
      gt(cachePermissionTable.lastUpdated, now - ttl)
    )
  });
  
  if (cacheEntry) return true;
  
  // Not in cache, check with API
  try {
    console.log("Checking repo access for", owner, repo, githubId);
    const octokit = createOctokitInstance(token);
    const response = await octokit.rest.repos.get({ owner, repo });
    console.log("Response", response.status === 200);
    // If successful, cache the result
    if (response.status === 200) {
      console.log("Caching result");
      await db.insert(cachePermissionTable)
        .values({
          githubId,
          owner: owner.toLowerCase(),
          repo: repo.toLowerCase(),
          lastUpdated: Date.now()
        })
        .onConflictDoUpdate({
          target: [
            cachePermissionTable.githubId, 
            cachePermissionTable.owner, 
            cachePermissionTable.repo
          ],
          set: { lastUpdated: Date.now() }
        });
    }
    
    return response.status === 200;
  } catch (error) {
    console.error("Error checking repo access", error);
    return false;
  }
};

export { 
  updateMultipleFilesCache, 
  updateFileCache,
  updateFileCacheRepository,
  updateFileCacheOwner,
  clearFileCache,
  getCollectionCache, 
  getMediaCache,
  checkRepoAccess
};