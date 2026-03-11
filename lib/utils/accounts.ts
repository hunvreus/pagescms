/**
 * Get the list of GitHub accounts the user (incl. collaborators) has access to.
 */

import { db } from "@/db";
import { collaboratorTable } from "@/db/schema";
import { sql } from "drizzle-orm";
import { getInstallations } from "@/lib/githubApp";
import { User } from "@/types/user";
import { getGithubAccount } from "@/lib/githubAccount";
import { requireGithubUserToken } from "@/lib/authz-server";
import { hasGithubIdentity } from "@/lib/authz";

const getAccounts = async (user: User) => {
	let accounts: Array<{
    login: string;
    type: string;
    repositorySelection: string;
    installationId: number;
  }> = [];
  const githubAccount = await getGithubAccount(user.id);

	if (githubAccount?.accessToken && hasGithubIdentity(user)) {
		const token = await requireGithubUserToken(user);
		
		const installations = await getInstallations(token);

		accounts = [
			...installations.map((installation: any) => ({
				login: installation.account.login,
				type: installation.account.type === "User" ? "user" : "org",
				repositorySelection: installation.repository_selection,
        installationId: installation.id
			}))
		];
	}

  const groupedRepos = await db
    .selectDistinct({
      owner: collaboratorTable.owner,
      type: collaboratorTable.type,
      installationId: collaboratorTable.installationId
    })
    .from(collaboratorTable)
    .where(sql`lower(${collaboratorTable.email}) = lower(${user.email})`);

  const collaboratorAccounts = groupedRepos.map(collaborator => ({
    login: collaborator.owner,
    type: collaborator.type,
    repositorySelection: "selected",
    installationId: collaborator.installationId
  }));

  const dedupedAccounts = new Map<string, (typeof accounts)[number]>();

  for (const account of accounts) {
    const key = `${account.login.toLowerCase()}::${account.installationId}`;
    dedupedAccounts.set(key, account);
  }

  for (const account of collaboratorAccounts) {
    const key = `${account.login.toLowerCase()}::${account.installationId}`;
    if (!dedupedAccounts.has(key)) {
      dedupedAccounts.set(key, account);
    }
  }

  accounts = Array.from(dedupedAccounts.values());

	if (accounts.length === 0) return [];

  return accounts;
};

export { getAccounts };
