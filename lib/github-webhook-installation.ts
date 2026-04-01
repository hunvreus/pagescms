import { db } from "@/db";
import { cacheFileTable, collaboratorTable, githubInstallationTokenTable } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { clearFileCache, updateFileCacheOwner, updateFileCacheRepository } from "@/lib/github-cache-file";
import { deleteCacheFileMeta, deleteCacheFileMetaByPaths } from "@/lib/github-cache-meta";

const chunkArray = <T,>(items: T[], size = 200): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const getAffectedParentPaths = (changedPaths: string[]) => {
  const parentPaths = new Set<string>([""]);

  for (const changedPath of changedPaths) {
    const parts = changedPath.split("/").filter(Boolean);
    if (parts.length < 2) continue;

    let current = "";
    for (let i = 0; i < parts.length - 1; i++) {
      current = current ? `${current}/${parts[i]}` : parts[i];
      parentPaths.add(current);
    }
  }

  return Array.from(parentPaths);
};

const clearScopedFileCache = async (
  owner: string,
  repo: string,
  branch: string,
  changedPaths: string[],
) => {
  const uniqueChangedPaths = Array.from(new Set(changedPaths.filter(Boolean)));
  const affectedParentPaths = getAffectedParentPaths(uniqueChangedPaths);
  await deleteCacheFileMetaByPaths(owner, repo, branch, affectedParentPaths);
  const whereBase = and(
    eq(cacheFileTable.owner, owner.toLowerCase()),
    eq(cacheFileTable.repo, repo.toLowerCase()),
    eq(cacheFileTable.branch, branch),
  );

  for (const pathsChunk of chunkArray(uniqueChangedPaths, 200)) {
    await db.delete(cacheFileTable).where(
      and(
        whereBase,
        inArray(cacheFileTable.path, pathsChunk),
      ),
    );
  }

  for (const parentPathsChunk of chunkArray(affectedParentPaths, 200)) {
    await db.delete(cacheFileTable).where(
      and(
        whereBase,
        inArray(cacheFileTable.parentPath, parentPathsChunk),
      ),
    );
  }
};

const handleInstallationWebhookEvent = async (event: string | null, data: any) => {
  switch (event) {
    case "installation":
      if (data.action !== "deleted") return false;

      {
        const accountLogin = data.installation?.account?.login;
        if (!accountLogin) {
          console.error("Missing account login in installation deleted event", data.installation);
          return true;
        }

        await Promise.all([
          db.delete(collaboratorTable).where(
            eq(collaboratorTable.installationId, data.installation.id),
          ),
          db.delete(githubInstallationTokenTable).where(
            eq(githubInstallationTokenTable.installationId, data.installation.id),
          ),
          clearFileCache(accountLogin),
          deleteCacheFileMeta(accountLogin),
        ]);
        return true;
      }

    case "installation_repositories":
      if (data.action !== "removed") return false;

      {
        const reposIdRemoved = data.repositories_removed?.map((repo: any) => repo.id) || [];
        if (reposIdRemoved.length === 0) return true;

        await db.delete(collaboratorTable).where(
          inArray(collaboratorTable.repoId, reposIdRemoved),
        );

        await Promise.all(
          (data.repositories_removed || []).map((repo: any) => {
            const [owner, repoName] = (repo.full_name || "").split("/");
            if (owner && repoName) {
              return Promise.all([
                clearFileCache(owner, repoName),
                deleteCacheFileMeta(owner, repoName),
              ]);
            }
            return Promise.resolve();
          }),
        );
        return true;
      }

    case "repository": {
      const owner = data.repository?.owner?.login;
      const repoName = data.repository?.name;
      const repoId = data.repository?.id;

      if (!owner || !repoName || !repoId) {
        console.error("Missing repository data in webhook", { owner, repoName, repoId });
        return true;
      }

      if (data.action === "deleted") {
        await Promise.all([
          db.delete(collaboratorTable).where(
            eq(collaboratorTable.repoId, repoId),
          ),
          clearFileCache(owner, repoName),
          deleteCacheFileMeta(owner, repoName),
        ]);
      } else if (data.action === "transferred") {
        const oldOwner = data.changes?.owner?.from?.login || owner;

        await Promise.all([
          db.delete(collaboratorTable).where(
            eq(collaboratorTable.repoId, repoId),
          ),
          clearFileCache(oldOwner, repoName),
          deleteCacheFileMeta(oldOwner, repoName),
        ]);
      } else if (data.action === "renamed") {
        const oldName = data.changes?.repository?.name?.from;
        if (!oldName) {
          console.error("Missing old repository name in rename event");
          return true;
        }

        await Promise.all([
          db.update(collaboratorTable).set({
            repo: repoName,
          }).where(
            eq(collaboratorTable.repoId, repoId),
          ),
          updateFileCacheRepository(owner, oldName, repoName),
        ]);
      }
      return true;
    }

    case "installation_target":
      if (data.action !== "renamed") return false;

      {
        const oldOwner = data.changes?.login?.from;
        const newOwner = data.account?.login;
        const accountId = data.account?.id;

        if (!oldOwner || !newOwner || !accountId) {
          console.error("Missing account rename data in webhook", { oldOwner, newOwner, accountId });
          return true;
        }

        await Promise.all([
          db.update(collaboratorTable).set({
            owner: newOwner,
          }).where(
            eq(collaboratorTable.ownerId, accountId),
          ),
          updateFileCacheOwner(oldOwner, newOwner),
        ]);
        return true;
      }

    case "delete":
      if (data.ref_type !== "branch") return false;

      {
        const deleteOwner = data.repository?.owner?.login;
        const deleteRepo = data.repository?.name;
        const deleteBranch = data.ref?.replace("refs/heads/", "");

        if (!deleteOwner || !deleteRepo || !deleteBranch) {
          console.error("Missing branch deletion data in webhook", { deleteOwner, deleteRepo, deleteBranch });
          return true;
        }

        await clearFileCache(deleteOwner, deleteRepo, deleteBranch);
        await deleteCacheFileMeta(deleteOwner, deleteRepo, deleteBranch);
        return true;
      }

    default:
      return false;
  }
};

export { clearScopedFileCache, handleInstallationWebhookEvent };
