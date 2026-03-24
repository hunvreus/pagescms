import { and, eq, gt, like, or } from "drizzle-orm";
import { db } from "../../index";
import { accountTable, userTable } from "../../schema";
import { mergeUsers, repairLegacyEmailForUser } from "../../../lib/legacy-email-repair";

const getArgValue = (name: string): string | undefined => {
  const argument = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return argument ? argument.split("=").slice(1).join("=") : undefined;
};

const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`);

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
};

const sleep = async (ms: number) => {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const runUserEmailRepairPass = async ({
  dryRun,
  batchSize,
  maxUsers,
  sleepMs,
  userIdFilter,
}: {
  dryRun: boolean;
  batchSize: number;
  maxUsers?: number;
  sleepMs: number;
  userIdFilter?: string;
}) => {
  let cursorCreatedAt: Date | undefined;
  let cursorId: string | undefined;
  let scanned = 0;
  let sawAnyCandidates = false;

  let updated = 0;
  let merged = 0;
  let skipped = 0;
  let failed = 0;

  while (true) {
    if (maxUsers && scanned >= maxUsers) break;

    const pageLimit = maxUsers
      ? Math.min(batchSize, Math.max(0, maxUsers - scanned))
      : batchSize;

    if (pageLimit <= 0) break;

    const users = await db.query.userTable.findMany({
      where: userIdFilter
        ? eq(userTable.id, userIdFilter)
        : and(
          like(userTable.email, "%@local.invalid"),
          cursorCreatedAt && cursorId
            ? or(
              gt(userTable.createdAt, cursorCreatedAt),
              and(
                eq(userTable.createdAt, cursorCreatedAt),
                gt(userTable.id, cursorId),
              ),
            )
            : undefined,
        ),
      orderBy: (table, { asc }) => [asc(table.createdAt), asc(table.id)],
      limit: pageLimit,
    });

    if (!users.length) break;

    sawAnyCandidates = true;

    for (const user of users) {
      scanned += 1;
      try {
        if (dryRun) {
          console.log(`[dry-run] evaluate user ${user.id} (${user.email})`);
        } else {
          const result = await repairLegacyEmailForUser(user.id, {
            allowAmbiguousGithubMerge: false,
          });

          if (result.status === "updated") {
            updated += 1;
            console.log(`✅ updated ${result.userId}: ${result.email}`);
          } else if (result.status === "merged") {
            merged += 1;
            console.log(`🔀 merged ${result.fromUserId} -> ${result.toUserId} (${result.email})`);
          } else if (result.status === "skipped" || result.status === "noop") {
            skipped += 1;
          }
        }
      } catch (error: any) {
        failed += 1;
        console.warn(`⚠️ Failed for user ${user.id}: ${error?.message ?? String(error)}`);
      }

      await sleep(sleepMs);
      if (maxUsers && scanned >= maxUsers) break;
    }

    if (userIdFilter) break;

    const last = users[users.length - 1];
    cursorCreatedAt = last.createdAt;
    cursorId = last.id;
  }

  if (!sawAnyCandidates) {
    console.log("No matching users found.");
    return;
  }

  console.log("User email repair pass summary:");
  console.log(`- updated: ${updated}`);
  console.log(`- merged: ${merged}`);
  console.log(`- skipped_or_noop: ${skipped}`);
  console.log(`- failed: ${failed}`);
};

const runDedupeAllPass = async ({
  dryRun,
  sleepMs,
}: {
  dryRun: boolean;
  sleepMs: number;
}) => {
  const users = await db.query.userTable.findMany();
  if (!users.length) return;

  const groups = new Map<string, typeof users>();
  for (const user of users) {
    const key = user.email.trim().toLowerCase();
    const group = groups.get(key) || [];
    group.push(user);
    groups.set(key, group);
  }

  let merged = 0;
  let failed = 0;

  for (const [emailKey, group] of groups.entries()) {
    if (group.length < 2) continue;

    const withGithub = await Promise.all(
      group.map(async (user) => {
        const githubAccount = await db.query.accountTable.findFirst({
          where: and(
            eq(accountTable.userId, user.id),
            eq(accountTable.providerId, "github"),
          ),
        });
        return { user, hasGithub: Boolean(githubAccount) };
      }),
    );

    withGithub.sort((a, b) => {
      if (Number(b.hasGithub) !== Number(a.hasGithub)) return Number(b.hasGithub) - Number(a.hasGithub);
      return a.user.createdAt.getTime() - b.user.createdAt.getTime();
    });

    const canonical = withGithub[0]?.user;
    const duplicates = withGithub.slice(1).map((item) => item.user);
    if (!canonical || duplicates.length === 0) continue;

    for (const duplicate of duplicates) {
      try {
        if (dryRun) {
          console.log(`[dry-run] dedupe ${duplicate.id} -> ${canonical.id} (${emailKey})`);
        } else {
          await mergeUsers(duplicate.id, canonical.id, { preferredEmail: emailKey });
          console.log(`🔀 deduped ${duplicate.id} -> ${canonical.id} (${emailKey})`);
          merged += 1;
        }
      } catch (error: any) {
        failed += 1;
        console.warn(`⚠️ dedupe failed ${duplicate.id} -> ${canonical.id}: ${error?.message ?? String(error)}`);
      }

      await sleep(sleepMs);
    }
  }

  if (dryRun) return;

  console.log("Dedupe-all pass summary:");
  console.log(`- merged: ${merged}`);
  console.log(`- failed: ${failed}`);
};

const main = async () => {
  const dryRun = hasFlag("dry-run");
  const batchSize = parsePositiveInt(getArgValue("limit"), 250);
  const maxUsersArg = getArgValue("max-users");
  const maxUsers = maxUsersArg ? parsePositiveInt(maxUsersArg, 0) : undefined;
  const sleepMs = parsePositiveInt(getArgValue("sleep-ms"), 200);
  const userIdFilter = getArgValue("user-id");
  const dedupeAll = hasFlag("dedupe-all");

  await runUserEmailRepairPass({
    dryRun,
    batchSize,
    maxUsers,
    sleepMs,
    userIdFilter,
  });

  if (dedupeAll) {
    console.log("Running extra dedupe-all pass.");
    await runDedupeAllPass({
      dryRun,
      sleepMs,
    });
  }
};

main().catch((error) => {
  console.error("❌ Failed to repair/merge user emails:", error);
  process.exit(1);
});
