/**
 * Get the list of GitHub accounts the user (incl. collaborators) has access to.
 */

import { db } from "@/db";
import { collaboratorTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserToken } from "@/lib/token";
import { getInstallations } from "@/lib/githubApp";
import { User } from "@/types/user";

const getAccounts = async (user: User) => {
  let accounts;

	if (user.githubId) {
		const token = await getUserToken();
		if (!token) throw new Error("Token not found");
		
		const installations = await getInstallations(token);

		accounts = [
			...installations.map((installation: any) => ({
				login: installation.account.login,
				type: installation.account.type === "User" ? "user" : "org",
				repositorySelection: installation.repository_selection,
        installationId: installation.id
			}))
		];
	} else {
		const groupedRepos = await db
			.select({
				owner: collaboratorTable.owner,
				type: collaboratorTable.type,
        installationId: collaboratorTable.installationId
			})
			.from(collaboratorTable)
			.where(eq(collaboratorTable.email, user.email))
			.groupBy(collaboratorTable.ownerId);

		accounts = groupedRepos.map(collaborator => ({
			login: collaborator.owner,
			type: collaborator.type,
			repositorySelection: "selected",
      installationId: collaborator.installationId
		}));
	}

	if (accounts.length === 0) return [];

  return accounts;
};

export { getAccounts };