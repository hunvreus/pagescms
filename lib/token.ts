/**
 * Token helper functions.
 */

import { cache } from "react";
import { App } from "octokit";
import { decrypt, encrypt } from "@/lib/crypto";
import { db } from "@/db";
import {
  collaboratorTable,
  githubInstallationTokenTable
} from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { User } from "@/types/user";
import { getGithubAccount } from "@/lib/githubAccount";

// Get a token for a user (including collagborators who need to provide an owner/repo scope).
const getToken = cache(async (user: User, owner: string, repo: string) => {
  const githubAccount = await getGithubAccount(user.id);
  if (githubAccount?.accessToken) return githubAccount.accessToken;

  const permission = await db.query.collaboratorTable.findFirst({
    where: and(
      sql`lower(${collaboratorTable.email}) = lower(${user.email})`,
      sql`lower(${collaboratorTable.owner}) = lower(${owner})`,
      sql`lower(${collaboratorTable.repo}) = lower(${repo})`
    )
  });
  if (!permission) throw new Error(`You do not have permission to access "${owner}/${repo}".`);

  const installationToken = await getInstallationToken(owner, repo);

  return installationToken
});

// Get the GitHub App installation token for a specific repository.
const getInstallationToken = cache(async (owner: string, repo: string) => {
  const app = new App({
		appId: process.env.GITHUB_APP_ID!,
		privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
	});

  const repoInstallation = await app.octokit.rest.apps.getRepoInstallation({ owner, repo });
  if (!repoInstallation) throw new Error(`Installation token not found for "${owner}/${repo}".`);

  let tokenData = await db.query.githubInstallationTokenTable.findFirst({
    where: eq(githubInstallationTokenTable.installationId, repoInstallation.data.id)
  });

  if (tokenData && Date.now() < tokenData.expiresAt.getTime() - 60_000) {
    const token = await decrypt(tokenData.ciphertext, tokenData.iv);
    if (!token) throw new Error(`Token could not be retrieved and/or decrypted.`);

    return token;
  }

  const installationToken = await app.octokit.rest.apps.createInstallationAccessToken({
    installation_id: repoInstallation.data.id
  });

  const { ciphertext, iv } = await encrypt(installationToken.data.token);
    
  const expiresAt = new Date(installationToken.data.expires_at)

  if (tokenData) {
    await db.update(githubInstallationTokenTable).set({
      ciphertext,
      iv,
      expiresAt
    }).where(
      eq(githubInstallationTokenTable.id, tokenData.id)
    );
  } else {
    await db.insert(githubInstallationTokenTable).values({
      ciphertext,
      iv,
      installationId: repoInstallation.data.id,
      expiresAt
    }).returning();
  }

  return installationToken.data.token;
});

// Get the GitHub user token.
const getUserToken = cache(async (userId: string) => {
  const githubAccount = await getGithubAccount(userId);
  if (!githubAccount?.accessToken) throw new Error(`GitHub token not found for user ${userId}.`);

  return githubAccount.accessToken;
});

export { getInstallationToken, getUserToken, getToken };
