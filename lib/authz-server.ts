import "server-only";

import type { User } from "@/types/user";
import { assertGithubIdentity } from "@/lib/authz";
import { getUserToken } from "@/lib/token";
import { getWritableRepoAccess } from "@/lib/utils/repoAccess";

const requireGithubUserToken = async (
  user: Pick<User, "id" | "githubUsername">,
  identityErrorMessage = "Only GitHub users can perform this action.",
) => {
  assertGithubIdentity(user, identityErrorMessage);
  return getUserToken(user.id);
};

const requireGithubRepoWriteAccess = async (
  user: Pick<User, "id" | "githubUsername">,
  owner: string,
  repo: string,
  identityErrorMessage = "Only GitHub users can perform this action.",
) => {
  const token = await requireGithubUserToken(user, identityErrorMessage);
  const repoAccess = await getWritableRepoAccess(token, owner, repo);

  return { token, repoAccess };
};

export { requireGithubUserToken, requireGithubRepoWriteAccess };
