import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../index";
import { collaboratorTable, userTable } from "../../schema";
import { parseCsv } from "./csv";

const getArgValue = (name: string): string | undefined => {
  const argument = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return argument ? argument.split("=").slice(1).join("=") : undefined;
};

const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`);

const parseNumberOrNull = (value: string | undefined): number | null => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const parseRequiredNumber = (value: string | undefined, label: string): number => {
  const parsed = parseNumberOrNull(value);
  if (parsed == null) throw new Error(`Invalid or missing "${label}"`);
  return parsed;
};

const findUserById = async (id: string | undefined | null) => {
  if (!id) return null;
  return db.query.userTable.findFirst({ where: eq(userTable.id, id) });
};

const findUserByEmail = async (email: string | undefined | null) => {
  if (!email) return null;
  return db.query.userTable.findFirst({
    where: sql`lower(${userTable.email}) = lower(${email})`,
  });
};

const main = async () => {
  const input = getArgValue("input");
  if (!input) {
    throw new Error("Missing required --input=<path> argument");
  }

  const replace = hasFlag("replace");
  const defaultInvitedByUserId = getArgValue("default-invited-by-user-id");
  const defaultInvitedByEmail = getArgValue("default-invited-by-email");

  const csvPath = resolve(process.cwd(), input);
  const csvContent = await readFile(csvPath, "utf8");
  const rows = parseCsv(csvContent);

  if (!rows.length) {
    console.log("⚠️ No rows found in CSV");
    return;
  }

  if (replace) {
    await db.delete(collaboratorTable);
    console.log("🧹 Existing collaborators cleared (--replace)");
  }

  const defaultInvitedByUser =
    (await findUserById(defaultInvitedByUserId))
    ?? (await findUserByEmail(defaultInvitedByEmail));

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const rowNumber = i + 2;

    try {
      const type = row.type?.trim();
      const owner = row.owner?.trim();
      const repo = row.repo?.trim();
      const email = row.email?.trim();
      const branch = row.branch?.trim() || null;

      if (!type || !owner || !repo || !email) {
        throw new Error("Missing one of required fields: type, owner, repo, email");
      }

      const installationId = parseRequiredNumber(row.installationId, "installationId");
      const ownerId = parseRequiredNumber(row.ownerId, "ownerId");
      const repoId = parseNumberOrNull(row.repoId);

      const invitedByUser =
        (await findUserById(row.invitedBy?.trim()))
        ?? (await findUserByEmail(row.invitedByEmail?.trim()))
        ?? defaultInvitedByUser;

      // userId is optional; if missing, we try matching by collaborator email.
      let linkedUserId: string | null = null;
      if (row.userId?.trim()) {
        const linkedUser = await findUserById(row.userId.trim());
        linkedUserId = linkedUser?.id ?? null;
      } else {
        const linkedByEmail = await findUserByEmail(email);
        linkedUserId = linkedByEmail?.id ?? null;
      }

      const existing = await db.query.collaboratorTable.findFirst({
        where: and(
          sql`lower(${collaboratorTable.owner}) = lower(${owner})`,
          sql`lower(${collaboratorTable.repo}) = lower(${repo})`,
          sql`lower(${collaboratorTable.email}) = lower(${email})`
        ),
      });

      const values = {
        type,
        installationId,
        ownerId,
        repoId,
        owner,
        repo,
        branch,
        email,
        userId: linkedUserId,
        invitedBy: invitedByUser?.id ?? null,
      };

      if (existing) {
        await db
          .update(collaboratorTable)
          .set(values)
          .where(eq(collaboratorTable.id, existing.id));
        updated += 1;
      } else {
        await db.insert(collaboratorTable).values(values);
        inserted += 1;
      }
    } catch (error: any) {
      skipped += 1;
      console.warn(`⚠️ Row ${rowNumber} skipped: ${error.message}`);
    }
  }

  console.log(`✅ Import complete: inserted=${inserted}, updated=${updated}, skipped=${skipped}`);
};

main().catch((error) => {
  console.error("❌ Failed to import collaborators:", error);
  process.exit(1);
});
