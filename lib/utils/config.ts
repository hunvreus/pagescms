/**
 * Utility functions to create, retrieve and update a repository configuration
 * from the DB.
 * 
 * Look at the `lib/config.ts` file to understand how the config is parsed,
 * normalized and validated.
 */

import { cache } from "react";
import { Config } from "@/types/config";
import { db } from "@/db";
import { configTable } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { createOctokitInstance } from "@/lib/utils/octokit";
import { configVersion, normalizeConfig, parseConfig } from "@/lib/config";

// TODO: add a fallback behavior to retrieve conf if not in DB
const getConfigUncached = async (
  owner: string,
  repo: string,
  branch: string,
): Promise<Config | null> => {
  if (!owner || !repo || !branch) throw new Error(`Owner, repo, and branch must all be provided.`);
  
  const config = await db.query.configTable.findFirst({
    where: and(
      sql`lower(${configTable.owner}) = lower(${owner})`,
      sql`lower(${configTable.repo}) = lower(${repo})`,
      eq(configTable.branch, branch),
    )
  });
  
  if (!config) return null;

  return {
    owner: config.owner,
    repo: config.repo,
    branch: config.branch,
    sha: config.sha,
    version: config.version,
    object: JSON.parse(config.object),
    lastCheckedAt: config.lastCheckedAt,
  }
};

const getConfig = cache(
  async (
    owner: string,
    repo: string,
    branch: string,
  ): Promise<Config | null> => {
    return getConfigUncached(owner, repo, branch);
  }
);

const saveConfig = async (
  config: Config,
): Promise<Config> => {
  const result = await db.insert(configTable).values({
    owner: config.owner,
    repo: config.repo,
    branch: config.branch,
    sha: config.sha,
    version: config.version,
    object: JSON.stringify(config.object),
    lastCheckedAt: new Date(),
  });

  return config;
}

const updateConfig = async (
  config: Config,
): Promise<Config> => {
  await db.update(configTable).set({
    sha: config.sha,
    version: config.version,
    object: JSON.stringify(config.object),
    lastCheckedAt: new Date(),
  }).where(
    and(
      sql`lower(${configTable.owner}) = lower(${config.owner})`,
      sql`lower(${configTable.repo}) = lower(${config.repo})`,
      eq(configTable.branch, config.branch)
    )
  );

  return config;
}

const touchConfigCheck = async (
  owner: string,
  repo: string,
  branch: string,
) => {
  await db.update(configTable).set({
    lastCheckedAt: new Date(),
  }).where(
    and(
      sql`lower(${configTable.owner}) = lower(${owner})`,
      sql`lower(${configTable.repo}) = lower(${repo})`,
      eq(configTable.branch, branch),
    ),
  );
};

type ConfigSyncOptions = {
  ttlMs?: number;
};

const DEFAULT_CONFIG_CHECK_TTL_MS = parseInt(
  process.env.CONFIG_CHECK_TTL || "5",
  10,
) * 60 * 1000;

const isConfigCheckDue = (lastCheckedAt?: Date, ttlMs = DEFAULT_CONFIG_CHECK_TTL_MS) => {
  if (!lastCheckedAt) return true;
  return Date.now() - new Date(lastCheckedAt).getTime() > ttlMs;
};

const fetchConfigFromGithub = async (
  owner: string,
  repo: string,
  branch: string,
  token: string,
): Promise<Pick<Config, "sha" | "object"> | null> => {
  const octokit = createOctokitInstance(token);
  try {
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: ".pages.yml",
      ref: branch,
      headers: { Accept: "application/vnd.github.v3+json" },
    });

    if (Array.isArray(response.data)) {
      throw new Error("Expected .pages.yml to be a file but found a directory.");
    }
    if (response.data.type !== "file") {
      throw new Error("Invalid .pages.yml response type.");
    }

    const configFile = Buffer.from(response.data.content, "base64").toString();
    const parsed = parseConfig(configFile);
    const configObject = normalizeConfig(parsed.document.toJSON());

    return {
      sha: response.data.sha,
      object: configObject,
    };
  } catch (error: any) {
    if (error?.status === 404 && error?.response?.data?.message === "Not Found") {
      return null;
    }
    throw error;
  }
};

const getConfigWithSync = async (
  owner: string,
  repo: string,
  branch: string,
  getToken: () => Promise<string>,
  options?: ConfigSyncOptions,
): Promise<Config | null> => {
  const cachedConfig = await getConfigUncached(owner, repo, branch);
  const ttlMs = options?.ttlMs ?? DEFAULT_CONFIG_CHECK_TTL_MS;

  if (
    cachedConfig &&
    cachedConfig.version === configVersion &&
    !isConfigCheckDue(cachedConfig.lastCheckedAt, ttlMs)
  ) {
    return cachedConfig;
  }

  const token = await getToken();
  if (!token) throw new Error("Token not found");

  const latest = await fetchConfigFromGithub(owner, repo, branch, token);
  if (!latest) {
    if (cachedConfig) {
      await db.delete(configTable).where(
        and(
          sql`lower(${configTable.owner}) = lower(${owner})`,
          sql`lower(${configTable.repo}) = lower(${repo})`,
          eq(configTable.branch, branch),
        ),
      );
    }
    return null;
  }

  if (cachedConfig && cachedConfig.version === configVersion && cachedConfig.sha === latest.sha) {
    await touchConfigCheck(owner, repo, branch);
    return {
      ...cachedConfig,
      lastCheckedAt: new Date(),
    };
  }

  const nextConfig: Config = {
    owner: owner.toLowerCase(),
    repo: repo.toLowerCase(),
    branch,
    sha: latest.sha,
    version: configVersion ?? "0.0",
    object: latest.object,
  };

  if (cachedConfig) {
    await updateConfig(nextConfig);
  } else {
    await saveConfig(nextConfig);
  }

  return nextConfig;
};

export { getConfig, getConfigWithSync, saveConfig, updateConfig, touchConfigCheck };
