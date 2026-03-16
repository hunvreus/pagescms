/**
 * Utility functions to create, retrieve and update a repository configuration
 * from the DB.
 * 
 * Look at the `lib/config.ts` file to understand how the config is parsed,
 * normalized and validated.
 */

import { Config } from "@/types/config";
import { db } from "@/db";
import { configTable } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { createOctokitInstance } from "@/lib/utils/octokit";
import { configVersion, normalizeConfig, parseConfig } from "@/lib/config";

// TODO: add a fallback behavior to retrieve conf if not in DB
const getConfigFromDb = async (
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

  const parsedConfig = {
    owner: config.owner,
    repo: config.repo,
    branch: config.branch,
    sha: config.sha,
    version: config.version,
    object: JSON.parse(config.object),
    lastCheckedAt: config.lastCheckedAt,
  };

  return parsedConfig;
};

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

type GetConfigOptions = {
  sync?: boolean;
  getToken?: () => Promise<string>;
  ttlMs?: number;
  backgroundRefreshWhenStale?: boolean;
};

const DEFAULT_CONFIG_CHECK_TTL_MS = parseInt(
  process.env.CONFIG_CHECK_MIN ||
    process.env.CFG_CHECK_MIN ||
    process.env.CONFIG_CHECK_TTL ||
    "5",
  10,
) * 60 * 1000;

const isConfigCheckDue = (lastCheckedAt?: Date, ttlMs = DEFAULT_CONFIG_CHECK_TTL_MS) => {
  if (!lastCheckedAt) return true;
  return Date.now() - new Date(lastCheckedAt).getTime() > ttlMs;
};

const configSyncInFlight = new Map<string, Promise<Config | null>>();
const getConfigSyncKey = (owner: string, repo: string, branch: string) =>
  `${owner.toLowerCase()}::${repo.toLowerCase()}::${branch}`;

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

const getConfig = async (
  owner: string,
  repo: string,
  branch: string,
  options?: GetConfigOptions,
): Promise<Config | null> => {
  const sync = options?.sync ?? false;
  if (!sync) return getConfigFromDb(owner, repo, branch);

  const getToken = options?.getToken;
  if (!getToken) throw new Error("getToken is required when sync is enabled.");

  const normalizedOwner = owner.toLowerCase();
  const normalizedRepo = repo.toLowerCase();
  const key = getConfigSyncKey(normalizedOwner, normalizedRepo, branch);
  const existing = configSyncInFlight.get(key);
  if (existing) return existing;

  const run = (async (): Promise<Config | null> => {
  const cachedConfig = await getConfigFromDb(normalizedOwner, normalizedRepo, branch);
  const ttlMs = options?.ttlMs ?? DEFAULT_CONFIG_CHECK_TTL_MS;
  const backgroundRefreshWhenStale = options?.backgroundRefreshWhenStale ?? false;

  if (
    cachedConfig &&
    cachedConfig.version === configVersion &&
    !isConfigCheckDue(cachedConfig.lastCheckedAt, ttlMs)
  ) {
    return cachedConfig;
  }

  if (
    cachedConfig &&
    cachedConfig.version === configVersion &&
    backgroundRefreshWhenStale
  ) {
    // Return stale cache immediately and refresh async to reduce branch-layout blocking.
    void (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const latest = await fetchConfigFromGithub(owner, repo, branch, token);
        if (!latest) {
          await db.delete(configTable).where(
            and(
              sql`lower(${configTable.owner}) = lower(${normalizedOwner})`,
              sql`lower(${configTable.repo}) = lower(${normalizedRepo})`,
              eq(configTable.branch, branch),
            ),
          );
          return;
        }
        if (cachedConfig.sha === latest.sha) {
          await touchConfigCheck(owner, repo, branch);
          return;
        }
        const nextConfig: Config = {
          owner: normalizedOwner,
          repo: normalizedRepo,
          branch,
          sha: latest.sha,
          version: configVersion ?? "0.0",
          object: latest.object,
        };
        await updateConfig(nextConfig);
      } catch {
        // Ignore background refresh failures; stale cached config remains usable.
      }
    })();

    return cachedConfig;
  }

  const token = await getToken();
  if (!token) throw new Error("Token not found");

  const latest = await fetchConfigFromGithub(owner, repo, branch, token);
  if (!latest) {
    if (cachedConfig) {
      await db.delete(configTable).where(
        and(
          sql`lower(${configTable.owner}) = lower(${normalizedOwner})`,
          sql`lower(${configTable.repo}) = lower(${normalizedRepo})`,
          eq(configTable.branch, branch),
        ),
      );
    }
    return null;
  }

  if (cachedConfig && cachedConfig.version === configVersion && cachedConfig.sha === latest.sha) {
    await touchConfigCheck(normalizedOwner, normalizedRepo, branch);
    return {
      ...cachedConfig,
      lastCheckedAt: new Date(),
    };
  }

  const nextConfig: Config = {
    owner: normalizedOwner,
    repo: normalizedRepo,
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
  })();

  configSyncInFlight.set(key, run);
  try {
    return await run;
  } finally {
    configSyncInFlight.delete(key);
  }
};

export { getConfig, saveConfig, updateConfig, touchConfigCheck };
