import "server-only";

import { and, eq, inArray, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { cacheFileMetaTable } from "@/db/schema";

type CacheMetaScope = {
  path?: string;
  context?: string;
};

const normalizeScope = (scope?: CacheMetaScope) => ({
  path: scope?.path ?? "",
  context: scope?.context ?? "branch",
});

const CACHE_META_SYNC_STALE_MS = parseInt(
  process.env.CACHE_META_SYNC_STALE_MS || "15000",
  10,
);

const upsertCacheFileMeta = async (
  owner: string,
  repo: string,
  branch: string,
  values: {
    path?: string;
    context?: string;
    commitSha?: string | null;
    commitTimestamp?: Date | null;
    status?: string;
    error?: string | null;
    lastCheckedAt?: Date;
  } = {},
) => {
  const now = new Date();
  const scope = normalizeScope(values);
  const row = {
    owner: owner.toLowerCase(),
    repo: repo.toLowerCase(),
    branch,
    path: scope.path,
    context: scope.context,
    commitSha: values.commitSha ?? null,
    commitTimestamp: values.commitTimestamp ?? null,
    status: values.status ?? "ok",
    error: values.error ?? null,
    updatedAt: now,
    lastCheckedAt: values.lastCheckedAt ?? now,
  };

  const where = and(
    sql`lower(${cacheFileMetaTable.owner}) = lower(${owner})`,
    sql`lower(${cacheFileMetaTable.repo}) = lower(${repo})`,
    eq(cacheFileMetaTable.branch, branch),
    eq(cacheFileMetaTable.path, scope.path),
    eq(cacheFileMetaTable.context, scope.context),
  );

  const updated = await db
    .update(cacheFileMetaTable)
    .set(row)
    .where(where)
    .returning({ id: cacheFileMetaTable.id });

  if (updated.length === 0) {
    await db.insert(cacheFileMetaTable).values(row);
  }
};

const getCacheFileMeta = async (
  owner: string,
  repo: string,
  branch: string,
  scope?: CacheMetaScope,
) => {
  const normalizedScope = normalizeScope(scope);
  return db.query.cacheFileMetaTable.findFirst({
    where: and(
      sql`lower(${cacheFileMetaTable.owner}) = lower(${owner})`,
      sql`lower(${cacheFileMetaTable.repo}) = lower(${repo})`,
      eq(cacheFileMetaTable.branch, branch),
      eq(cacheFileMetaTable.path, normalizedScope.path),
      eq(cacheFileMetaTable.context, normalizedScope.context),
    ),
  });
};

const tryClaimCacheFileMeta = async (
  owner: string,
  repo: string,
  branch: string,
  values: {
    path?: string;
    context?: string;
    commitSha?: string | null;
    commitTimestamp?: Date | null;
    error?: string | null;
    lastCheckedAt?: Date;
  } = {},
) => {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - CACHE_META_SYNC_STALE_MS);
  const scope = normalizeScope(values);
  const row = {
    owner: owner.toLowerCase(),
    repo: repo.toLowerCase(),
    branch,
    path: scope.path,
    context: scope.context,
    commitSha: values.commitSha ?? null,
    commitTimestamp: values.commitTimestamp ?? null,
    status: "syncing",
    error: values.error ?? null,
    updatedAt: now,
    lastCheckedAt: values.lastCheckedAt ?? now,
  };

  const scopeWhere = and(
    sql`lower(${cacheFileMetaTable.owner}) = lower(${owner})`,
    sql`lower(${cacheFileMetaTable.repo}) = lower(${repo})`,
    eq(cacheFileMetaTable.branch, branch),
    eq(cacheFileMetaTable.path, scope.path),
    eq(cacheFileMetaTable.context, scope.context),
  );

  const updated = await db
    .update(cacheFileMetaTable)
    .set(row)
    .where(
      and(
        scopeWhere,
        or(
          ne(cacheFileMetaTable.status, "syncing"),
          lt(cacheFileMetaTable.updatedAt, staleBefore),
        ),
      ),
    )
    .returning({ id: cacheFileMetaTable.id });

  if (updated.length > 0) return true;

  const inserted = await db
    .insert(cacheFileMetaTable)
    .values(row)
    .onConflictDoNothing({
      target: [
        cacheFileMetaTable.owner,
        cacheFileMetaTable.repo,
        cacheFileMetaTable.branch,
        cacheFileMetaTable.path,
        cacheFileMetaTable.context,
      ],
    })
    .returning({ id: cacheFileMetaTable.id });

  return inserted.length > 0;
};

const deleteCacheFileMeta = async (
  owner: string,
  repo?: string,
  branch?: string,
  scope?: CacheMetaScope,
) => {
  const normalizedScope = scope ? normalizeScope(scope) : null;
  const conditions = [sql`lower(${cacheFileMetaTable.owner}) = lower(${owner})`];

  if (repo) {
    conditions.push(sql`lower(${cacheFileMetaTable.repo}) = lower(${repo})`);
  }

  const baseWhere = and(...conditions);

  if (branch) {
    const scopedWhere = normalizedScope
      ? and(
          baseWhere,
          eq(cacheFileMetaTable.branch, branch),
          eq(cacheFileMetaTable.path, normalizedScope.path),
          eq(cacheFileMetaTable.context, normalizedScope.context),
        )
      : and(baseWhere, eq(cacheFileMetaTable.branch, branch));
    await db
      .delete(cacheFileMetaTable)
      .where(scopedWhere);
    return;
  }

  await db.delete(cacheFileMetaTable).where(baseWhere);
};

const deleteCacheFileMetaByPaths = async (
  owner: string,
  repo: string,
  branch: string,
  paths: string[],
) => {
  const normalizedPaths = Array.from(new Set(paths));
  if (normalizedPaths.length === 0) return;

  await db.delete(cacheFileMetaTable).where(
    and(
      sql`lower(${cacheFileMetaTable.owner}) = lower(${owner})`,
      sql`lower(${cacheFileMetaTable.repo}) = lower(${repo})`,
      eq(cacheFileMetaTable.branch, branch),
      inArray(cacheFileMetaTable.path, normalizedPaths),
    ),
  );
};

const listCacheFileMeta = async (
  owner: string,
  repo: string,
  branch: string,
) => {
  return db.query.cacheFileMetaTable.findMany({
    where: and(
      sql`lower(${cacheFileMetaTable.owner}) = lower(${owner})`,
      sql`lower(${cacheFileMetaTable.repo}) = lower(${repo})`,
      eq(cacheFileMetaTable.branch, branch),
    ),
    orderBy: (table, { asc }) => [asc(table.context), asc(table.path)],
  });
};

export {
  deleteCacheFileMeta,
  deleteCacheFileMetaByPaths,
  getCacheFileMeta,
  listCacheFileMeta,
  tryClaimCacheFileMeta,
  upsertCacheFileMeta,
};
