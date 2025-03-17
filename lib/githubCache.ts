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
  type: 'add' | 'modify' | 'delete';
  path: string;
  sha?: string;
  content?: string;
};

// Bulk update cache entries (removed, modified and added files).
const updateCache = async (
  owner: string,
  repo: string,
  branch: string,
  removedFiles: Array<{ path: string }>,
  modifiedFiles: Array<FileChange>,
  addedFiles: Array<FileChange>,
  token: string
) => {
  // Get all unique parent paths for all operations
  const parentPaths = Array.from(new Set([
    ...removedFiles.map(f => path.dirname(f.path)),
    ...modifiedFiles.map(f => path.dirname(f.path)),
    ...addedFiles.map(f => path.dirname(f.path))
  ]));
  
  const entries = await db.query.cachedEntriesTable.findMany({
    where: and(
      eq(cachedEntriesTable.owner, owner),
      eq(cachedEntriesTable.repo, repo),
      eq(cachedEntriesTable.branch, branch),
      inArray(cachedEntriesTable.parentPath, parentPaths)
    )
  });

  const cachedParentPaths = parentPaths.length > 0 ? 
    Array.from(new Set(entries.map(e => e.parentPath))) : [];

  // Only process files in cached directories
  const filesToRemove = removedFiles.filter(file => 
    cachedParentPaths.includes(path.dirname(file.path))
  );

  const filesToFetch = [
    ...modifiedFiles.filter(file => cachedParentPaths.includes(path.dirname(file.path))),
    ...addedFiles.filter(file => cachedParentPaths.includes(path.dirname(file.path)))
  ];

  // Delete removed files (only if in cached directories)
  if (filesToRemove.length > 0) {
    await db.delete(cachedEntriesTable).where(
      and(
        eq(cachedEntriesTable.owner, owner),
        eq(cachedEntriesTable.repo, repo),
        eq(cachedEntriesTable.branch, branch),
        inArray(cachedEntriesTable.path, filesToRemove.map(f => f.path))
      )
    );
  }

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

  // Process the results
  const updates = filesToFetch.map((file, index) => {
    const fileData = response.repository[`file${index}`];
    return {
      path: file.path,
      parentPath: path.dirname(file.path),
      content: fileData.text,
      sha: fileData.oid,
      lastUpdated: Date.now()
    };
  });

  // Batch update the cache
  for (const update of updates) {
    const isModified = modifiedFiles.some(f => f.path === update.path);
    
    if (isModified) {
      // Update existing entry
      await db.update(cachedEntriesTable)
        .set({
          content: update.content,
          sha: update.sha,
          lastUpdated: update.lastUpdated
        })
        .where(
          and(
            eq(cachedEntriesTable.owner, owner),
            eq(cachedEntriesTable.repo, repo),
            eq(cachedEntriesTable.branch, branch),
            eq(cachedEntriesTable.path, update.path)
          )
        );
    } else {
      // Insert new entry
      await db.insert(cachedEntriesTable)
        .values({
          owner,
          repo,
          branch,
          path: update.path,
          parentPath: update.parentPath,
          name: path.basename(update.path),
          type: 'blob',
          content: update.content,
          sha: update.sha,
          lastUpdated: update.lastUpdated
        });
    }
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
  let entries = await db.query.cachedEntriesTable.findMany({
    where: and(
      eq(cachedEntriesTable.owner, owner),
      eq(cachedEntriesTable.repo, repo),
      eq(cachedEntriesTable.branch, branch),
      eq(cachedEntriesTable.parentPath, path)
    )
  });

  if (entries.length === 0) {
    // No cache hit, fetch from GitHub
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
    // TODO: handle 401 / Bad credentials error

    let githubEntries = response.repository?.object?.entries || [];

    if (githubEntries.length > 0) {
      entries = await db.insert(cachedEntriesTable)
        .values(githubEntries.map((entry: any) => ({
          owner: owner,
          repo: repo,
          branch: branch,
          parentPath: path,
          name: entry.name,
          path: entry.path,
          type: entry.type,
          content: entry.type === "blob" ? entry.object.text : null,
          sha: entry.type === "blob" ? entry.object.oid : null,
          lastUpdated: Date.now()
        })))
        .returning();
    }
  }

  return entries;
}

// Update the cache for an individual file (add, modify and delete).
const updateFileCache = async (
  owner: string,
  repo: string,
  branch: string,
  operation: FileOperation
) => {
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

      const entry = {
        owner,
        repo,
        branch,
        path: operation.path,
        parentPath,
        name: path.basename(operation.path),
        type: 'blob',
        content: operation.content,
        sha: operation.sha,
        lastUpdated: Date.now()
      };

      if (operation.type === 'modify') {
        // We always update entries in the cache if they are already present
        await db.update(cachedEntriesTable)
          .set({
            content: entry.content,
            sha: entry.sha,
            lastUpdated: entry.lastUpdated
          })
          .where(
            and(
              eq(cachedEntriesTable.owner, owner),
              eq(cachedEntriesTable.repo, repo),
              eq(cachedEntriesTable.branch, branch),
              eq(cachedEntriesTable.path, operation.path)
            )
          );
      } else {
        // We only cache collections (and maybe media folders later on). When a
        // file is added, we only add it to the cache if there are already existing
        // entries with the same parent path (meaning getCachedCollection (or
        // getCachedMedia once we have media) has already been called on this path).
        const sibling = await db.query.cachedEntriesTable.findFirst({
          where: and(
            eq(cachedEntriesTable.owner, owner),
            eq(cachedEntriesTable.repo, repo),
            eq(cachedEntriesTable.branch, branch),
            eq(cachedEntriesTable.parentPath, parentPath)
          )
        });

        if (sibling) {
          await db.insert(cachedEntriesTable).values(entry);
        }
      }
      break;
  }
};

export { updateCache, getCachedCollection, updateFileCache };