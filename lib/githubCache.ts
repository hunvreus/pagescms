/**
 * Herlper functions to manage the database cache.
 */

import { db } from "@/db";
import { eq, and, inArray } from "drizzle-orm";
import { cachedEntriesTable } from "@/db/schema";
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
  // Handle removed files first (we don't need context for these)
  if (removedFiles.length > 0) {
    await db.delete(cachedEntriesTable).where(
      and(
        eq(cachedEntriesTable.owner, owner),
        eq(cachedEntriesTable.repo, repo),
        eq(cachedEntriesTable.branch, branch),
        inArray(cachedEntriesTable.path, removedFiles.map(f => f.path))
      )
    );
  }
  
  // Now handle added/modified files
  // Get all unique parent paths for add/modify operations
  const parentPaths = Array.from(new Set([
    ...modifiedFiles.map(f => path.dirname(f.path)),
    ...addedFiles.map(f => path.dirname(f.path))
  ]));
  
  if (parentPaths.length === 0) return; // Nothing to add or modify
  
  // Create a map to store context information for each parent path
  const pathContextMap = new Map<string, CacheContext>();
  
  // First try to find collection contexts (preferred)
  const collectionEntries = await db.query.cachedEntriesTable.findMany({
    where: and(
      eq(cachedEntriesTable.context, 'collection'),
      eq(cachedEntriesTable.owner, owner),
      eq(cachedEntriesTable.repo, repo),
      eq(cachedEntriesTable.branch, branch),
      inArray(cachedEntriesTable.parentPath, parentPaths)
    )
  });
  
  // Map parent paths to collection context
  for (const entry of collectionEntries) {
    if (!pathContextMap.has(entry.parentPath)) {
      pathContextMap.set(entry.parentPath, 'collection');
    }
  }
  
  // For any remaining parent paths, check for media context
  const remainingPaths = parentPaths.filter(path => !pathContextMap.has(path));
  
  if (remainingPaths.length > 0) {
    const mediaEntries = await db.query.cachedEntriesTable.findMany({
      where: and(
        eq(cachedEntriesTable.context, 'media'),
        eq(cachedEntriesTable.owner, owner),
        eq(cachedEntriesTable.repo, repo),
        eq(cachedEntriesTable.branch, branch),
        inArray(cachedEntriesTable.parentPath, remainingPaths)
      )
    });
    
    // Map parent paths to media context
    for (const entry of mediaEntries) {
      if (!pathContextMap.has(entry.parentPath)) {
        pathContextMap.set(entry.parentPath, 'media');
      }
    }
  }

  // If we have commit info, check existing entries to avoid unnecessary processing
  let existingEntries: any[] = [];
  if (commit) {
    const allPaths = [...modifiedFiles.map(f => f.path), ...addedFiles.map(f => f.path)];
    
    if (allPaths.length > 0) {
      existingEntries = await db.query.cachedEntriesTable.findMany({
        where: and(
          eq(cachedEntriesTable.owner, owner),
          eq(cachedEntriesTable.repo, repo),
          eq(cachedEntriesTable.branch, branch),
          inArray(cachedEntriesTable.path, allPaths)
        )
      });
    }
  }

  // Filter files to only those with parent paths in our cache
  // AND if we have commit info, only those that need updating
  const modifiedFilesToProcess = modifiedFiles.filter(file => {
    const parentPath = path.dirname(file.path);
    const hasContext = pathContextMap.has(parentPath);
    
    if (!hasContext) return false;
    
    // If no commit info, always process
    if (!commit) return true;
    
    // Check if we need to process this file
    const existingEntry = existingEntries.find(e => e.path === file.path);
    
    // If no existing entry, we need to process it
    if (!existingEntry) return true;
    
    // If we have a newer version based on timestamp, skip
    if (existingEntry.commitTimestamp && 
        existingEntry.commitTimestamp > commit.timestamp) {
      return false;
    }
    
    // If timestamps are equal, check commit SHA
    if (existingEntry.commitTimestamp === commit.timestamp &&
        existingEntry.commitSha === commit.sha) {
      return false;
    }
    
    return true;
  });
  
  const addedFilesToProcess = addedFiles.filter(file => {
    const parentPath = path.dirname(file.path);
    const hasContext = pathContextMap.has(parentPath);
    
    if (!hasContext) return false;
    
    // For added files with commit info, check if they already exist
    if (commit) {
      const existingEntry = existingEntries.find(e => e.path === file.path);
      
      // If it exists and we have a newer or same version, skip
      if (existingEntry && existingEntry.commitTimestamp && 
          existingEntry.commitTimestamp >= commit.timestamp) {
        return false;
      }
    }
    
    return true;
  });

  const filesToFetch = [...modifiedFilesToProcess, ...addedFilesToProcess];
  
  if (filesToFetch.length === 0) return;

  // Fetch content for all files in a single GraphQL query
  const octokit = createOctokitInstance(token);
  
  const query = `
    query($owner: String!, $repo: String!, ${filesToFetch.map((_, i) => `$exp${i}: String!`).join(', ')}) {
      repository(owner: $owner, name: $repo) {
        ${filesToFetch.map((_, i) => `
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
    ...Object.fromEntries(
      filesToFetch.map((file, i) => [`exp${i}`, `${branch}:${file.path}`])
    )
  };

  const response: any = await octokit.graphql(query, variables);

  // Process the results and separate into updates and inserts
  const entriesToUpdate = [];
  const entriesToInsert = [];

  for (let i = 0; i < filesToFetch.length; i++) {
    const file = filesToFetch[i];
    const fileData = response.repository[`file${i}`];
    const parentPath = path.dirname(file.path);
    const context = pathContextMap.get(parentPath)!; // We know this exists because of our filter
    
    const isModified = modifiedFiles.some(f => f.path === file.path);
    
    if (isModified) {
      entriesToUpdate.push({
        context,
        owner,
        repo,
        branch,
        path: file.path,
        content: fileData.text,
        sha: fileData.oid,
        size: fileData.byteSize,
        downloadUrl: null,
        lastUpdated: Date.now(),
        ...(commit ? {
          commitSha: commit.sha,
          commitTimestamp: commit.timestamp
        } : {})
      });
    } else {
      entriesToInsert.push({
        context,
        owner,
        repo,
        branch,
        path: file.path,
        parentPath,
        name: path.basename(file.path),
        type: 'blob',
        content: fileData.text,
        sha: fileData.oid,
        size: fileData.byteSize,
        downloadUrl: null,
        lastUpdated: Date.now(),
        ...(commit ? {
          commitSha: commit.sha,
          commitTimestamp: commit.timestamp
        } : {})
      });
    }
  }

  // Batch update modified entries
  if (entriesToUpdate.length > 0) {
    await Promise.all(entriesToUpdate.map(entry => 
      db.update(cachedEntriesTable)
        .set({
          content: entry.content,
          sha: entry.sha,
          size: entry.size,
          downloadUrl: entry.downloadUrl,
          lastUpdated: entry.lastUpdated,
          ...(entry.commitSha ? { commitSha: entry.commitSha } : {}),
          ...(entry.commitTimestamp ? { commitTimestamp: entry.commitTimestamp } : {})
        })
        .where(
          and(
            eq(cachedEntriesTable.context, entry.context),
            eq(cachedEntriesTable.owner, entry.owner),
            eq(cachedEntriesTable.repo, entry.repo),
            eq(cachedEntriesTable.branch, entry.branch),
            eq(cachedEntriesTable.path, entry.path)
          )
        )
    ));
  }

  // Batch insert new entries
  if (entriesToInsert.length > 0) {
    await db.insert(cachedEntriesTable).values(entriesToInsert);
  }
}

// Attempt to get a collection from cache, if not found, fetch from GitHub.
const getCachedCollection = async (
  owner: string,
  repo: string,
  branch: string,
  path: string,
  token: string
) => {
  // Check the cache (no context as we may invalidate media cache)
  let entries = await db.query.cachedEntriesTable.findMany({
    where: and(
      eq(cachedEntriesTable.owner, owner),
      eq(cachedEntriesTable.repo, repo),
      eq(cachedEntriesTable.branch, branch),
      eq(cachedEntriesTable.parentPath, path)
    )
  });

  if (entries.length === 0 || (entries.length > 0 && entries[0].context === 'media')) {
    if (entries.length > 0 && entries[0].context === 'media') {
      // Drop the media context cache and override it 
      await db.delete(cachedEntriesTable).where(
        and(
        eq(cachedEntriesTable.owner, owner),
        eq(cachedEntriesTable.repo, repo),
        eq(cachedEntriesTable.branch, branch),
        eq(cachedEntriesTable.parentPath, path),
        eq(cachedEntriesTable.context, 'media')
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
      entries = await db.insert(cachedEntriesTable)
        .values(githubEntries.map((entry: any) => ({
          context: 'collection',
          owner,
          repo,
          branch,
          parentPath: path,
          name: entry.name,
          path: entry.path,
          type: entry.type,
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

// Update the cache for an individual file (add, modify and delete).
const updateFileCache = async (
  context: CacheContext,
  owner: string,
  repo: string,
  branch: string,
  operation: FileOperation
) => {
  // console.log('updateFileCache', context, owner, repo, branch, operation);
  const parentPath = path.dirname(operation.path);

  switch (operation.type) {
    case 'delete':
      // We always remove entries from the cache when the file is deleted
      await db.delete(cachedEntriesTable).where(
        and(
          eq(cachedEntriesTable.owner, owner),
          eq(cachedEntriesTable.repo, repo),
          eq(cachedEntriesTable.branch, branch),
          eq(cachedEntriesTable.path, operation.path)
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
        await db.update(cachedEntriesTable)
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
              eq(cachedEntriesTable.context, context),
              eq(cachedEntriesTable.owner, owner),
              eq(cachedEntriesTable.repo, repo),
              eq(cachedEntriesTable.branch, branch),
              eq(cachedEntriesTable.path, operation.path)
            )
          );
      } else {
        // We only cache collections and media folders. We only add files that already
        // have siblings in the cache. If not we can assume the collection or media
        // folder hasn't been cached yet, so we skip to avoid caching a single file.
        const sibling = await db.query.cachedEntriesTable.findFirst({
          where: and(
            eq(cachedEntriesTable.context, context),
            eq(cachedEntriesTable.owner, owner),
            eq(cachedEntriesTable.repo, repo),
            eq(cachedEntriesTable.branch, branch),
            eq(cachedEntriesTable.parentPath, parentPath)
          )
        });

        if (sibling) {
          await db.insert(cachedEntriesTable)
            .values({
              context,
              owner,
              repo,
              branch,
              path: operation.path,
              parentPath,
              name: path.basename(operation.path),
              type: 'blob',
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
      
      await db.update(cachedEntriesTable)
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
            eq(cachedEntriesTable.owner, owner),
            eq(cachedEntriesTable.repo, repo),
            eq(cachedEntriesTable.branch, branch),
            eq(cachedEntriesTable.path, operation.path)
          )
        );
      break;
  }
};

// TODO: NO MEDIA NAME???
// Attempt to get a media folder from cache, if not found, fetch from GitHub.
const getCachedMediaFolder = async (
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
    entries = await db.query.cachedEntriesTable.findMany({
      where: and(
        eq(cachedEntriesTable.owner, owner),
        eq(cachedEntriesTable.repo, repo),
        eq(cachedEntriesTable.branch, branch),
        eq(cachedEntriesTable.parentPath, path)
      )
    });
  }

  if (entries.length === 0) {  
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
      type: entry.type === "file" ? "blob" : "tree",
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
      entries = await db.insert(cachedEntriesTable)
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

export { updateMultipleFilesCache, getCachedCollection, updateFileCache, getCachedMediaFolder };