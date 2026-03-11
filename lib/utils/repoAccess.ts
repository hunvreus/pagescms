import { createOctokitInstance } from "@/lib/utils/octokit";

export const getWritableRepoAccess = async (
  token: string,
  owner: string,
  repo: string
) => {
  const octokit = createOctokitInstance(token);
  const response = await octokit.rest.repos.get({ owner, repo });

  if (!response.data.permissions?.push) {
    throw new Error(`You do not have write access to "${owner}/${repo}".`);
  }

  return {
    repoId: response.data.id,
    ownerId: response.data.owner.id,
    ownerLogin: response.data.owner.login,
    repoName: response.data.name,
    ownerType: response.data.owner.type === "User" ? "user" : "org",
  };
};

