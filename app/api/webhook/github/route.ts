import { after } from "next/server";
import crypto from "crypto";
import { db } from "@/db";
import { actionRunTable, cacheFileTable, collaboratorTable, configTable, githubInstallationTokenTable } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { normalizePath } from "@/lib/utils/file";
import { createOctokitInstance } from "@/lib/utils/octokit";
import { 
  updateMultipleFilesCache, 
  clearFileCache,
  updateFileCacheRepository,
  updateFileCacheOwner
} from "@/lib/github-cache";
import { getInstallationToken } from "@/lib/token";
import { configVersion, normalizeConfig, parseConfig } from "@/lib/config";
import { saveConfig, updateConfig } from "@/lib/utils/config";
import { deleteCacheFileMeta, upsertCacheFileMeta } from "@/lib/cache-file-meta";

export const runtime = "nodejs";
export const maxDuration = 60;

const WEBHOOK_PUSH_INCREMENTAL_MAX_FILES = Number.parseInt(
  process.env.WEBHOOK_PUSH_INCREMENTAL_MAX_FILES ?? "120",
  10,
);
const WEBHOOK_PUSH_SCOPED_INVALIDATION_MAX_FILES = Number.parseInt(
  process.env.WEBHOOK_PUSH_SCOPED_INVALIDATION_MAX_FILES ?? "800",
  10,
);

/**
 * Handles GitHub webhooks:
 * - Maintains tables related to GitHub installations (e.g. collaborators,
 *   installation tokens)
 * - Maintains GitHub cache (both files and permissions)
 * 
 * POST /api/webhook/github
 * 
 * Requires GitHub App webhook secret and signature.
 */

const chunkArray = <T,>(items: T[], size = 200): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const deleteConfigCacheForBranch = async (owner: string, repo: string, branch: string) => {
  await db.delete(configTable).where(
    and(
      sql`lower(${configTable.owner}) = lower(${owner})`,
      sql`lower(${configTable.repo}) = lower(${repo})`,
      eq(configTable.branch, branch),
    ),
  );
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

const processWebhookEvent = async (event: string | null, data: any) => {
  switch (event) {
    case "installation":
      if (data.action === "deleted") {
        const accountLogin = data.installation?.account?.login;
        if (!accountLogin) {
          console.error("Missing account login in installation deleted event", data.installation);
          break;
        }

        await Promise.all([
          db.delete(collaboratorTable).where(
            eq(collaboratorTable.installationId, data.installation.id),
          ),
          db.delete(githubInstallationTokenTable).where(
            eq(githubInstallationTokenTable.installationId, data.installation.id),
          ),
          clearFileCache(accountLogin),
        ]);
      }
      break;

    case "installation_repositories":
      if (data.action === "removed") {
        const reposIdRemoved = data.repositories_removed?.map((repo: any) => repo.id) || [];
        if (reposIdRemoved.length === 0) break;

        await db.delete(collaboratorTable).where(
          inArray(collaboratorTable.repoId, reposIdRemoved),
        );

        await Promise.all(
          (data.repositories_removed || []).map((repo: any) => {
            const [owner, repoName] = (repo.full_name || "").split("/");
            if (owner && repoName) {
              return clearFileCache(owner, repoName);
            }
            return Promise.resolve();
          }),
        );
      }
      break;

    case "repository": {
      const owner = data.repository?.owner?.login;
      const repoName = data.repository?.name;
      const repoId = data.repository?.id;

      if (!owner || !repoName || !repoId) {
        console.error("Missing repository data in webhook", { owner, repoName, repoId });
        break;
      }

      if (data.action === "deleted") {
        await Promise.all([
          db.delete(collaboratorTable).where(
            eq(collaboratorTable.repoId, repoId),
          ),
          clearFileCache(owner, repoName),
        ]);
      } else if (data.action === "transferred") {
        const oldOwner = data.changes?.owner?.from?.login || owner;

        await Promise.all([
          db.delete(collaboratorTable).where(
            eq(collaboratorTable.repoId, repoId),
          ),
          clearFileCache(oldOwner, repoName),
        ]);
      } else if (data.action === "renamed") {
        const oldName = data.changes?.repository?.name?.from;
        if (!oldName) {
          console.error("Missing old repository name in rename event");
          break;
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
      break;
    }

    case "installation_target":
      if (data.action === "renamed") {
        const oldOwner = data.changes?.login?.from;
        const newOwner = data.account?.login;
        const accountId = data.account?.id;

        if (!oldOwner || !newOwner || !accountId) {
          console.error("Missing account rename data in webhook", { oldOwner, newOwner, accountId });
          break;
        }

        await Promise.all([
          db.update(collaboratorTable).set({
            owner: newOwner,
          }).where(
            eq(collaboratorTable.ownerId, accountId),
          ),
          updateFileCacheOwner(oldOwner, newOwner),
        ]);
      }
      break;

    case "delete":
      if (data.ref_type === "branch") {
        const deleteOwner = data.repository?.owner?.login;
        const deleteRepo = data.repository?.name;
        const deleteBranch = data.ref?.replace("refs/heads/", "");

        if (!deleteOwner || !deleteRepo || !deleteBranch) {
          console.error("Missing branch deletion data in webhook", { deleteOwner, deleteRepo, deleteBranch });
          break;
        }

        await clearFileCache(deleteOwner, deleteRepo, deleteBranch);
        await deleteCacheFileMeta(deleteOwner, deleteRepo, deleteBranch);
      }
      break;

    case "push": {
      if (data.deleted === true) break;

      const pushOwner = data.repository?.owner?.login;
      const pushRepo = data.repository?.name;
      const ref = typeof data.ref === "string" ? data.ref : "";
      const pushBranch = ref.replace("refs/heads/", "");

      if (!pushOwner || !pushRepo || !pushBranch) {
        console.error("Missing push webhook data", { pushOwner, pushRepo, pushBranch, ref });
        break;
      }

      const commits = Array.isArray(data.commits) ? data.commits : [];
      const removedPathSet = new Set<string>();
      const modifiedPathSet = new Set<string>();
      const addedPathSet = new Set<string>();

      for (const commit of commits) {
        for (const filePath of commit.removed || []) removedPathSet.add(normalizePath(filePath));
        for (const filePath of commit.modified || []) modifiedPathSet.add(normalizePath(filePath));
        for (const filePath of commit.added || []) addedPathSet.add(normalizePath(filePath));
      }

      const removedFiles = Array.from(removedPathSet).map((path) => ({ path }));
      const modifiedFiles = Array.from(modifiedPathSet).map((path) => ({
        path,
        sha: data.head_commit?.id,
      }));
      const addedFiles = Array.from(addedPathSet).map((path) => ({
        path,
        sha: data.head_commit?.id,
      }));

      const changedPaths = [
        ...removedFiles.map((file) => file.path),
        ...modifiedFiles.map((file) => file.path),
        ...addedFiles.map((file) => file.path),
      ];
      const uniqueChangedPaths = Array.from(new Set(changedPaths));
      const changedCount = uniqueChangedPaths.length;
      const configFilePath = ".pages.yml";
      const configChanged = uniqueChangedPaths.includes(configFilePath);
      const configRemoved = removedFiles.some((file) => file.path === configFilePath);

      const commitTimestamp = Date.parse(data.head_commit?.timestamp ?? "");
      const commit = {
        sha: data.head_commit?.id ?? data.after ?? null,
        timestamp: Number.isNaN(commitTimestamp) ? Date.now() : commitTimestamp,
      };

      const largePush =
        WEBHOOK_PUSH_INCREMENTAL_MAX_FILES > 0
        && changedCount > WEBHOOK_PUSH_INCREMENTAL_MAX_FILES;
      const hugePush =
        WEBHOOK_PUSH_SCOPED_INVALIDATION_MAX_FILES > 0
        && changedCount > WEBHOOK_PUSH_SCOPED_INVALIDATION_MAX_FILES;

      if (hugePush) {
        console.warn("Push webhook exceeded scoped threshold. Falling back to branch cache clear.", {
          owner: pushOwner,
          repo: pushRepo,
          branch: pushBranch,
          changedCount,
          threshold: WEBHOOK_PUSH_SCOPED_INVALIDATION_MAX_FILES,
        });

        await clearFileCache(pushOwner, pushRepo, pushBranch);
        await upsertCacheFileMeta(pushOwner, pushRepo, pushBranch, {
          sha: commit.sha,
          status: "ok",
          error: null,
        });

        if (configChanged) {
          await deleteConfigCacheForBranch(pushOwner, pushRepo, pushBranch);
        }
        break;
      }

      if (largePush) {
        console.warn("Push webhook exceeded incremental threshold. Falling back to scoped cache clear.", {
          owner: pushOwner,
          repo: pushRepo,
          branch: pushBranch,
          changedCount,
          threshold: WEBHOOK_PUSH_INCREMENTAL_MAX_FILES,
        });

        await clearScopedFileCache(pushOwner, pushRepo, pushBranch, uniqueChangedPaths);
        await upsertCacheFileMeta(pushOwner, pushRepo, pushBranch, {
          sha: commit.sha,
          status: "ok",
          error: null,
        });

        if (configChanged) {
          await deleteConfigCacheForBranch(pushOwner, pushRepo, pushBranch);
        }
        break;
      }

      const installationToken = await getInstallationToken(pushOwner, pushRepo);

      await updateMultipleFilesCache(
        pushOwner,
        pushRepo,
        pushBranch,
        removedFiles,
        modifiedFiles,
        addedFiles,
        installationToken,
        commit.sha
          ? {
            sha: commit.sha,
            timestamp: commit.timestamp,
          }
          : undefined,
      );

      await upsertCacheFileMeta(pushOwner, pushRepo, pushBranch, {
        sha: commit.sha,
        status: "ok",
        error: null,
      });

      if (configChanged) {
        if (configRemoved) {
          await deleteConfigCacheForBranch(pushOwner, pushRepo, pushBranch);
        } else {
          const octokit = createOctokitInstance(installationToken);
          const configFileResponse = await octokit.rest.repos.getContent({
            owner: pushOwner,
            repo: pushRepo,
            path: configFilePath,
            ref: pushBranch,
            headers: { Accept: "application/vnd.github.v3+json" },
          });

          if (Array.isArray(configFileResponse.data)) {
            throw new Error("Expected .pages.yml to be a file but found a directory.");
          }
          if (configFileResponse.data.type !== "file") {
            throw new Error(`Invalid .pages.yml response type: ${configFileResponse.data.type}`);
          }

          const configFile = Buffer.from(configFileResponse.data.content, "base64").toString();
          const parsed = parseConfig(configFile);
          if (parsed.errors.length > 0) {
            throw new Error(`Failed to parse .pages.yml: ${parsed.errors[0]?.message || "Unknown parse error"}`);
          }
          const configObject = normalizeConfig(parsed.document.toJSON());

          const existingConfig = await db.query.configTable.findFirst({
            where: and(
              sql`lower(${configTable.owner}) = lower(${pushOwner})`,
              sql`lower(${configTable.repo}) = lower(${pushRepo})`,
              eq(configTable.branch, pushBranch),
            ),
          });

          const nextConfig = {
            owner: pushOwner.toLowerCase(),
            repo: pushRepo.toLowerCase(),
            branch: pushBranch,
            sha: configFileResponse.data.sha,
            version: configVersion ?? "0.0",
            object: configObject,
          };

          if (existingConfig) {
            await updateConfig(nextConfig);
          } else {
            await saveConfig(nextConfig);
          }
        }
      }
      break;
    }

    case "workflow_run": {
      const workflowRunId = data.workflow_run?.id;
      if (!workflowRunId) break;

      await db.update(actionRunTable).set({
        status: data.workflow_run?.status ?? "completed",
        conclusion: data.workflow_run?.conclusion ?? null,
        htmlUrl: data.workflow_run?.html_url ?? null,
        updatedAt: new Date(),
        completedAt: data.workflow_run?.status === "completed"
          ? new Date(data.workflow_run?.updated_at ?? new Date().toISOString())
          : null,
      }).where(eq(actionRunTable.workflowRunId, workflowRunId));
      break;
    }
  }
};

export async function POST(request: Request) {
  try {
    const signature = request.headers.get("X-Hub-Signature-256");
    const event = request.headers.get("X-GitHub-Event");
    const body = await request.text();

    const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;
    if (!secret) {
      console.error("Missing GITHUB_APP_WEBHOOK_SECRET");
      return Response.json(null, { status: 500 });
    }

    const hmac = crypto.createHmac("sha256", secret);
    const digest = `sha256=${hmac.update(body).digest("hex")}`;
    if (!signature) {
      return Response.json(null, { status: 401 });
    }

    const signatureBuffer = Buffer.from(signature, "utf8");
    const digestBuffer = Buffer.from(digest, "utf8");
    if (
      signatureBuffer.length !== digestBuffer.length
      || !crypto.timingSafeEqual(signatureBuffer, digestBuffer)
    ) {
      return Response.json(null, { status: 401 });
    }

    const data = JSON.parse(body);

    after(async () => {
      try {
        await processWebhookEvent(event, data);
      } catch (error: any) {
        console.error("Error in Webhook", {
          error,
          event,
          payload: data,
          action: data?.action,
        });
      }
    });

    return Response.json(null, { status: 200 });
  } catch (error: any) {
    console.error("Error processing webhook:", error);
    return Response.json(null, { status: 500 });
  }
}
