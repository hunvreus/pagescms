import "server-only";

import { and, eq, sql } from "drizzle-orm";
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

const upsertCacheFileMeta = async (
  owner: string,
  repo: string,
  branch: string,
  values: {
    path?: string;
    context?: string;
    commitSha?: string | null;
    commitTimestamp?: Date | null;
    targetCommitSha?: string | null;
    targetCommitTimestamp?: Date | null;
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
    targetCommitSha: values.targetCommitSha ?? null,
    targetCommitTimestamp: values.targetCommitTimestamp ?? null,
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

const deleteCacheFileMeta = async (
  owner: string,
  repo: string,
  branch?: string,
  scope?: CacheMetaScope,
) => {
  const normalizedScope = scope ? normalizeScope(scope) : null;
  const baseWhere = and(
    sql`lower(${cacheFileMetaTable.owner}) = lower(${owner})`,
    sql`lower(${cacheFileMetaTable.repo}) = lower(${repo})`,
  );

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

export { deleteCacheFileMeta, getCacheFileMeta, upsertCacheFileMeta };
