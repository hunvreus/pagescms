import { db } from "@/db";
import { configTable } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { configVersion, normalizeConfig, parseConfig } from "@/lib/config";
import { saveConfig, updateConfig } from "@/lib/config-store";
import { clearFileCache, updateMultipleFilesCache } from "@/lib/github-cache-file";
import { deleteCacheFileMeta, upsertCacheFileMeta } from "@/lib/github-cache-meta";
import { clearScopedFileCache } from "@/lib/github-webhook-installation";
import { getInstallationToken } from "@/lib/token";
import { normalizePath } from "@/lib/utils/file";
import { createOctokitInstance } from "@/lib/utils/octokit";

const WEBHOOK_PUSH_INCREMENTAL_MAX_FILES = Number.parseInt(
  process.env.WEBHOOK_PUSH_INCREMENTAL_MAX_FILES ?? "120",
  10,
);
const WEBHOOK_PUSH_SCOPED_INVALIDATION_MAX_FILES = Number.parseInt(
  process.env.WEBHOOK_PUSH_SCOPED_INVALIDATION_MAX_FILES ?? "800",
  10,
);

const deleteConfigCacheForBranch = async (owner: string, repo: string, branch: string) => {
  await db.delete(configTable).where(
    and(
      sql`lower(${configTable.owner}) = lower(${owner})`,
      sql`lower(${configTable.repo}) = lower(${repo})`,
      eq(configTable.branch, branch),
    ),
  );
};

const handlePushWebhookEvent = async (event: string | null, data: any) => {
  if (event !== "push") return false;
  if (data.deleted === true) return true;

  const pushOwner = data.repository?.owner?.login;
  const pushRepo = data.repository?.name;
  const ref = typeof data.ref === "string" ? data.ref : "";
  const pushBranch = ref.replace("refs/heads/", "");

  if (!pushOwner || !pushRepo || !pushBranch) {
    console.error("Missing push webhook data", { pushOwner, pushRepo, pushBranch, ref });
    return true;
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
    await deleteCacheFileMeta(pushOwner, pushRepo, pushBranch);
    await upsertCacheFileMeta(pushOwner, pushRepo, pushBranch, {
      commitSha: commit.sha,
      status: "ok",
      error: null,
    });

    if (configChanged) {
      await deleteConfigCacheForBranch(pushOwner, pushRepo, pushBranch);
    }
    return true;
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
    await deleteCacheFileMeta(pushOwner, pushRepo, pushBranch);
    await upsertCacheFileMeta(pushOwner, pushRepo, pushBranch, {
      commitSha: commit.sha,
      status: "ok",
      error: null,
    });

    if (configChanged) {
      await deleteConfigCacheForBranch(pushOwner, pushRepo, pushBranch);
    }
    return true;
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
    commitSha: commit.sha,
    status: "ok",
    error: null,
  });

  if (!configChanged) return true;

  if (configRemoved) {
    await deleteConfigCacheForBranch(pushOwner, pushRepo, pushBranch);
    return true;
  }

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

  return true;
};

export { handlePushWebhookEvent };
