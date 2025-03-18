/**
 * Helper functions to manage the database cache.
 */

import { db } from "@/db";
import { eq, and, inArray } from "drizzle-orm";
import { cacheTable } from "@/db/schema";
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

// TODO: add pagination for very large repos.
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
    await db.delete(cacheTable).where(
      and(
        eq(cacheTable.owner, owner),
        eq(cacheTable.repo, repo),
        eq(cacheTable.branch, branch),
        inArray(cacheTable.path, removedFiles.map(f => f.path))
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
  const existingEntries = await db.query.cacheTable.findMany({
    where: and(
      eq(cacheTable.owner, owner),
      eq(cacheTable.repo, repo),
      eq(cacheTable.branch, branch),
      inArray(cacheTable.parentPath, parentPaths)
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
  let existingFilesMap = new Map<string, typeof cacheTable.$inferSelect>();
  if (commit) {
    const allPaths = [...modifiedFiles, ...addedFiles].map(f => f.path);
    const existingFiles = await db.query.cacheTable.findMany({
      where: and(
        eq(cacheTable.owner, owner),
        eq(cacheTable.repo, repo),
        eq(cacheTable.branch, branch),
        inArray(cacheTable.path, allPaths)
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
        type: 'blob',
        content: context === 'collection' ? fileData.text : null,
        sha: fileData.oid,
        size: fileData.byteSize,
        downloadUrl: null,
        lastUpdated: now,
        commitSha: commit?.sha ?? null,
        commitTimestamp: commit?.timestamp ?? null
      };

      if (existingEntry) {
        await db.update(cacheTable)
          .set(entryData)
          .where(eq(cacheTable.id, existingEntry.id));
      } else {
        await db.insert(cacheTable).values(entryData);
      }
    }
  }
};

// Attempt to get a collection from cache, if not found, fetch from GitHub.
const getCachedCollection = async (
  owner: string,
  repo: string,
  branch: string,
  path: string,
  token: string
) => {
  // Check the cache (no context as we may invalidate media cache)
  let entries = await db.query.cacheTable.findMany({
    where: and(
      eq(cacheTable.owner, owner),
      eq(cacheTable.repo, repo),
      eq(cacheTable.branch, branch),
      eq(cacheTable.parentPath, path)
    )
  });

  if (entries.length === 0 || (entries.length > 0 && entries[0].context === 'media')) {
    if (entries.length > 0 && entries[0].context === 'media') {
      // Drop the media context cache and override it 
      await db.delete(cacheTable).where(
        and(
        eq(cacheTable.owner, owner),
        eq(cacheTable.repo, repo),
        eq(cacheTable.branch, branch),
        eq(cacheTable.parentPath, path),
        eq(cacheTable.context, 'media')
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
      entries = await db.insert(cacheTable)
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
      await db.delete(cacheTable).where(
        and(
          eq(cacheTable.owner, owner),
          eq(cacheTable.repo, repo),
          eq(cacheTable.branch, branch),
          eq(cacheTable.path, operation.path)
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
        await db.update(cacheTable)
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
              eq(cacheTable.context, context),
              eq(cacheTable.owner, owner),
              eq(cacheTable.repo, repo),
              eq(cacheTable.branch, branch),
              eq(cacheTable.path, operation.path)
            )
          );
      } else {
        // We only cache collections and media folders. We only add files that already
        // have siblings in the cache. If not we can assume the collection or media
        // folder hasn't been cached yet, so we skip to avoid caching a single file.
        const sibling = await db.query.cacheTable.findFirst({
          where: and(
            eq(cacheTable.context, context),
            eq(cacheTable.owner, owner),
            eq(cacheTable.repo, repo),
            eq(cacheTable.branch, branch),
            eq(cacheTable.parentPath, parentPath)
          )
        });

        if (sibling) {
          await db.insert(cacheTable)
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
      
      await db.update(cacheTable)
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
            eq(cacheTable.owner, owner),
            eq(cacheTable.repo, repo),
            eq(cacheTable.branch, branch),
            eq(cacheTable.path, operation.path)
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
    entries = await db.query.cacheTable.findMany({
      where: and(
        eq(cacheTable.owner, owner),
        eq(cacheTable.repo, repo),
        eq(cacheTable.branch, branch),
        eq(cacheTable.parentPath, path)
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
      entries = await db.insert(cacheTable)
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