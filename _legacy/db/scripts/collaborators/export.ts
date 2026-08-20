import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../../index";
import { collaboratorTable, userTable } from "../../schema";
import { stringifyCsv } from "./csv";

const DEFAULT_OUTPUT = "collaborators-export.csv";

const getArgValue = (name: string): string | undefined => {
  const argument = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return argument ? argument.split("=").slice(1).join("=") : undefined;
};

const main = async () => {
  const output = getArgValue("output") || DEFAULT_OUTPUT;

  const rows = await db
    .select({
      type: collaboratorTable.type,
      installationId: collaboratorTable.installationId,
      ownerId: collaboratorTable.ownerId,
      repoId: collaboratorTable.repoId,
      owner: collaboratorTable.owner,
      repo: collaboratorTable.repo,
      branch: collaboratorTable.branch,
      email: collaboratorTable.email,
      userId: collaboratorTable.userId,
      invitedBy: collaboratorTable.invitedBy,
      invitedByEmail: userTable.email,
    })
    .from(collaboratorTable)
    .leftJoin(userTable, eq(collaboratorTable.invitedBy, userTable.id));

  const csv = stringifyCsv(rows, [
    "type",
    "installationId",
    "ownerId",
    "repoId",
    "owner",
    "repo",
    "branch",
    "email",
    "userId",
    "invitedBy",
    "invitedByEmail",
  ]);

  const outputPath = resolve(process.cwd(), output);
  await writeFile(outputPath, csv, "utf8");

  console.log(`✅ Exported ${rows.length} collaborators to ${outputPath}`);
};

main().catch((error) => {
  console.error("❌ Failed to export collaborators:", error);
  process.exit(1);
});
