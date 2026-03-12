import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cacheFileMetaTable } from "@/db/schema";

const upsertCacheFileMeta = async (
  owner: string,
  repo: string,
  branch: string,
  values: {
    sha?: string | null;
    status?: string;
    error?: string | null;
    lastCheckedAt?: Date;
  } = {},
) => {
  const now = new Date();
  const row = {
    owner: owner.toLowerCase(),
    repo: repo.toLowerCase(),
    branch,
    sha: values.sha ?? null,
    status: values.status ?? "ok",
    error: values.error ?? null,
    updatedAt: now,
    lastCheckedAt: values.lastCheckedAt ?? now,
  };

  await db
    .insert(cacheFileMetaTable)
    .values(row)
    .onConflictDoUpdate({
      target: [
        cacheFileMetaTable.owner,
        cacheFileMetaTable.repo,
        cacheFileMetaTable.branch,
      ],
      set: row,
    });
};

const getCacheFileMeta = async (
  owner: string,
  repo: string,
  branch: string,
) => {
  return db.query.cacheFileMetaTable.findFirst({
    where: and(
      sql`lower(${cacheFileMetaTable.owner}) = lower(${owner})`,
      sql`lower(${cacheFileMetaTable.repo}) = lower(${repo})`,
      eq(cacheFileMetaTable.branch, branch),
    ),
  });
};

const deleteCacheFileMeta = async (
  owner: string,
  repo: string,
  branch?: string,
) => {
  const baseWhere = and(
    sql`lower(${cacheFileMetaTable.owner}) = lower(${owner})`,
    sql`lower(${cacheFileMetaTable.repo}) = lower(${repo})`,
  );

  if (branch) {
    await db
      .delete(cacheFileMetaTable)
      .where(and(baseWhere, eq(cacheFileMetaTable.branch, branch)));
    return;
  }

  await db.delete(cacheFileMetaTable).where(baseWhere);
};

export { deleteCacheFileMeta, getCacheFileMeta, upsertCacheFileMeta };
