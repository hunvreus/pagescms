/**
 * Helper functions to manage the database cache.
 */

import { db } from "@/db";
import { eq, and, inArray, gt, count, min } from "drizzle-orm";
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

// Helper to get all non-root ancestor paths (e.g., [a, a/b, a/b/c] for a/b/c/file.txt)
const getAncestorPaths = (filePath: string): string[] => {
  const ancestors: string[] = [];
  let currentPath = path.dirname(filePath);
  while (currentPath !== '.') {
    ancestors.push(currentPath);
    currentPath = path.dirname(currentPath);
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
    const parent = path.dirname(p);
    if (parent !== '.') allRelevantPaths.add(parent);
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
  const now = Date.now();

  if (addedPaths.length > 0) {
    for (const filePath of addedPaths) {
      const ancestors = getAncestorPaths(filePath);
      const directParent = path.dirname(filePath);
      const pathsToCheckForAdd = directParent === '.' ? ancestors : [directParent, ...ancestors];

      for (const dirPath of pathsToCheckForAdd) {
        if (!existingDirMap.has(dirPath) && !dirsToInsertData.has(dirPath)) {
          const parentDir = path.dirname(dirPath);
          if (parentDir !== '.') {
            parentPathsNeedingContext.add(parentDir);
          }
          // Add placeholder, context will be filled later if possible
          dirsToInsertData.set(dirPath, {
            context: 'collection', // Default, will be updated
            owner: lowerOwner, repo: lowerRepo, branch,
            path: dirPath, parentPath: parentDir, name: path.basename(dirPath),
            type: 'dir', lastUpdated: now,
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
      const directParent = path.dirname(filePath);
      const pathsToCheckForDelete = directParent === '.' ? ancestors : [directParent, ...ancestors];

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
  const directParent = path.dirname(filePath);
  const relevantPaths = directParent === '.' ? ancestors : [directParent, ...ancestors];

  if (relevantPaths.length === 0) return; // We're at the root, no need to update

  const now = Date.now();

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
        const parentDir = path.dirname(dirPath);
        let context = 'collection'; // Default
        if (parentDir !== '.') {
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
          path: dirPath, parentPath: parentDir, name: path.basename(dirPath), type: 'dir', lastUpdated: now,
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
  }

  // 2. Collect unique non-root parent paths for added/modified files
  const parentPaths = Array.from(new Set([
    ...modifiedFiles.map(f => path.dirname(f.path)),
    ...addedFiles.map(f => path.dirname(f.path))
  ])).filter(p => p !== '.');

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
    if (existingEntry.commitTimestamp && existingEntry.commitTimestamp > commit.timestamp) return false;
    if (existingEntry.commitTimestamp === commit.timestamp && existingEntry.commitSha === commit.sha) return false;

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

        const parentPath = path.dirname(file.path);
        const context = parentPath === '.' ? 'collection' : (pathContextMap.get(parentPath) || 'collection');
        const now = Date.now();

        const entryData = {
          context, owner: lowerOwner, repo: lowerRepo, branch,
          path: file.path, parentPath, name: path.basename(file.path),
          type: 'file' as 'file' | 'dir',
          content: context === 'collection' ? fileData.text : null,
          sha: fileData.oid, size: fileData.byteSize, downloadUrl: null,
          lastUpdated: now,
          commitSha: commit?.sha ?? null, commitTimestamp: commit?.timestamp ?? null
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
  const parentPath = path.dirname(operation.path);

  switch (operation.type) {
    case 'delete':
      // Remove the specific 'file' entry
      await db.delete(cacheFileTable).where(
        and(
          eq(cacheFileTable.owner, lowerOwner), eq(cacheFileTable.repo, lowerRepo), eq(cacheFileTable.branch, branch),
          eq(cacheFileTable.type, 'file'), // Only delete file type here
          eq(cacheFileTable.path, operation.path)
        )
      );
      // Update parent cache after successful delete
      await updateParentFolderCache(owner, repo, branch, operation.path, 'delete');
      break;

    case 'add':
    case 'modify':
      if (operation.content === undefined || !operation.sha) {
        throw new Error('Content and SHA are required for add/modify operations');
      }

      const now = Date.now();
      const entryData = {
        context, owner: lowerOwner, repo: lowerRepo, branch,
        path: operation.path, parentPath, name: path.basename(operation.path),
        type: 'file' as 'file' | 'dir',
        content: context === 'collection' ? operation.content : null,
        sha: operation.sha, size: operation.size, downloadUrl: operation.downloadUrl,
        lastUpdated: now,
        commitSha: operation.commit?.sha ?? null, commitTimestamp: operation.commit?.timestamp ?? null
      };

      // Upsert the file entry
      await db.insert(cacheFileTable)
        .values(entryData)
        .onConflictDoUpdate({
          target: [cacheFileTable.owner, cacheFileTable.repo, cacheFileTable.branch, cacheFileTable.path],
          set: { ...entryData, id: undefined }
        });

      // Only update parent for 'add' operations where parent was likely already cached
      if (operation.type === 'add') {
        await updateParentFolderCache(owner, repo, branch, operation.path, 'add');
      }
      break;

    case 'rename':
      if (!operation.newPath) throw new Error('newPath is required for rename operations');

      const renameNow = Date.now();
      const newParentPath = path.dirname(operation.newPath);
      const newName = path.basename(operation.newPath);

      // Update the existing entry to the new path/name
      const updateResult = await db.update(cacheFileTable)
        .set({
          path: operation.newPath,
          parentPath: newParentPath,
          name: newName,
          downloadUrl: null, // Reset download URL
          lastUpdated: renameNow,
          commitSha: operation.commit?.sha ?? null,
          commitTimestamp: operation.commit?.timestamp ?? null
        })
        .where(
          and(
            eq(cacheFileTable.owner, lowerOwner), eq(cacheFileTable.repo, lowerRepo), eq(cacheFileTable.branch, branch),
            eq(cacheFileTable.path, operation.path) // Find by old path
          )
        ).returning({ id: cacheFileTable.id }); // Check if update happened

      // Update parent caches only if the update was successful and parent changed
      if (updateResult.length > 0 && parentPath !== newParentPath) {
        // Treat as delete from old parent hierarchy
        await updateParentFolderCache(owner, repo, branch, operation.path, 'delete');
        // Treat as add to new parent hierarchy
        await updateParentFolderCache(owner, repo, branch, operation.newPath, 'add');
      }
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
  dirPath : string,
  token: string,
  nodeEntryFilename?: string
) => {
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
  if (entries.length > 0 && process.env.FILE_CACHE_TTL !== "-1") {
    const now = Date.now();
    const ttl = parseInt(process.env.FILE_CACHE_TTL || "10080") * 60 * 1000; // Defaults to 7 days cache
    cacheExpired = entries[0].lastUpdated < now - ttl;
  }

  
  let octokit;
  if (entries.length === 0 || cacheExpired || (entries.length > 0 && entries[0].context === 'media')) {
    if (cacheExpired || (entries.length > 0 && entries[0].context === 'media')) {
      // Drop the cache, either because it expired or because we're replacing media
      // cache with collection cache.
      await db.delete(cacheFileTable).where(
        and(
          eq(cacheFileTable.owner, owner.toLowerCase()),
          eq(cacheFileTable.repo, repo.toLowerCase()),
          eq(cacheFileTable.branch, branch),
          eq(cacheFileTable.parentPath, dirPath),
        )
      );
    }

    // Fetch from GitHub to create the collection cache
    octokit = createOctokitInstance(token);
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
      owner: owner,
      repo: repo,
      expression: `${branch}:${dirPath}`
    });

    let githubEntries = responseEntries.repository?.object?.entries || [];

    if (githubEntries.length > 0) {
      // We populate the cache
      entries = await db.insert(cacheFileTable)
        .values(githubEntries.map((entry: any) => ({
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
          downloadUrl: null, // GraphQL doesn't return download URLs
          lastUpdated: Date.now(),
          // Need commit info if possible, but GraphQL tree doesn't provide it easily
          commitSha: null,
          commitTimestamp: null
        })))
        .returning();
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
              lastUpdated: Date.now(),
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
          eq(cacheFileTable.owner, owner.toLowerCase()),
          eq(cacheFileTable.repo, repo.toLowerCase()),
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
      context: 'media',
      owner: owner.toLowerCase(),
      repo: repo.toLowerCase(),
      branch,
      parentPath: path,
      name: entry.name,
      path: entry.path,
      type: entry.type, // 'file' or 'dir'
      content: null,
      sha: entry.sha,
      size: entry.size || null,
      downloadUrl: entry.download_url || null,
      lastUpdated: Date.now(),
      commitSha: null, // REST API doesn't provide last commit info here
      commitTimestamp: null
    }));

    if (!nocache && githubEntries.length > 0) {
      // Cache the entries
      entries = await db.insert(cacheFileTable)
        .values(mappedEntries)
        .returning();
    } else {
      // When `nocache`, we don't cache the entries
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
    const octokit = createOctokitInstance(token);
    const response = await octokit.rest.repos.get({ owner, repo });
    // If successful, cache the result
    if (response.status === 200) {
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