#!/usr/bin/env node
/**
 * Legacy Pages CMS collaborator exporter (SQLite/Turso/libSQL).
 *
 * Why this exists:
 * - older Pages CMS installs used SQLite/libSQL/Turso
 * - this exports collaborators into a CSV compatible with the current importer
 *
 * Usage (ephemeral dependency, no project install required):
 *
 * SQLITE_URL="libsql://..." SQLITE_AUTH_TOKEN="..." \
 * npx -y -p @libsql/client node db/scripts/export-collaborators-legacy-libsql.mjs --out=collaborators.csv
 *
 * Or pass credentials as args:
 *
 * npx -y -p @libsql/client node db/scripts/export-collaborators-legacy-libsql.mjs \
 *   --url="libsql://..." \
 *   --token="..." \
 *   --out=collaborators.csv
 *
 * Output CSV columns:
 * type,installationId,ownerId,repoId,owner,repo,branch,email,userId,invitedBy,invitedByEmail
 */

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@libsql/client";

const getArg = (name) => {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
};

const escapeCsv = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
};

const stringifyCsv = (rows, columns) => {
  const lines = [columns.map(escapeCsv).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsv(row[column])).join(","));
  }
  return `${lines.join("\n")}\n`;
};

const main = async () => {
  const url = getArg("url") || process.env.SQLITE_URL;
  const token = getArg("token") || process.env.SQLITE_AUTH_TOKEN;
  const out = getArg("out") || "collaborators-export.csv";

  if (!url) {
    throw new Error(
      "Missing SQLite/libSQL URL. Pass --url=... or set SQLITE_URL env var.",
    );
  }

  const client = createClient({
    url,
    authToken: token,
  });

  // Legacy schema columns expected:
  // collaborator: type, installation_id, owner_id, repo_id, owner, repo, branch, email, user_id, invited_by
  // user: id, email
  const query = `
    select
      c.type as type,
      c.installation_id as installationId,
      c.owner_id as ownerId,
      c.repo_id as repoId,
      c.owner as owner,
      c.repo as repo,
      c.branch as branch,
      c.email as email,
      c.user_id as userId,
      c.invited_by as invitedBy,
      u.email as invitedByEmail
    from collaborator c
    left join user u on u.id = c.invited_by
    order by c.owner, c.repo, c.email
  `;

  const response = await client.execute(query);
  const rows = (response.rows || []).map((row) => ({
    type: row.type ?? "",
    installationId: row.installationId ?? "",
    ownerId: row.ownerId ?? "",
    repoId: row.repoId ?? "",
    owner: row.owner ?? "",
    repo: row.repo ?? "",
    branch: row.branch ?? "",
    email: row.email ?? "",
    userId: row.userId ?? "",
    invitedBy: row.invitedBy ?? "",
    invitedByEmail: row.invitedByEmail ?? "",
  }));

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

  const outPath = resolve(process.cwd(), out);
  await writeFile(outPath, csv, "utf8");
  console.log(`Exported ${rows.length} collaborators to ${outPath}`);
};

main().catch((error) => {
  console.error("Export failed:", error.message || error);
  process.exit(1);
});
