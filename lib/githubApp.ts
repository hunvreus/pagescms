
/**
 * Helper functions to get GitHub Appinstallations info.
 */

import { createOctokitInstance } from "@/lib/utils/octokit";

// Get all GitHub App installations for the authenticated user.
const getInstallations = async (
  token: string,
  owners?: string[],
  filterById: boolean = false
) => {
  let installations: any[] = [];
  const matchedInstallations: any[] = [];

  const octokit = createOctokitInstance(token);

  let page = 1;
  let hasMore = true;
  const perPage = 100;

  while (hasMore) {
    const response = await octokit.rest.apps.listInstallationsForAuthenticatedUser({
      page,
      per_page: perPage
    });

    if (response.data.installations.length === 0) break;

    installations = installations.concat(response.data.installations);

    if (owners) {
      for (const installation of installations) {
        const matches = filterById
          ? owners.includes(installation.account.id.toString()) // Match by ID
          : owners.includes(installation.account.login.toLowerCase()); // Match by name

        if (matches && !matchedInstallations.find((m: any) => m.id === installation.id)) {
          matchedInstallations.push(installation);
        }
      }

      // Early exit if all desired installations are found
      if (matchedInstallations.length === owners.length) {
        return matchedInstallations;
      }
    }
    
    hasMore = (page * perPage <= response.data.total_count);
    page++;
  }

  return matchedInstallations.length ? matchedInstallations : installations;
};

// Get all repositories for a GitHub App installation.)
const getInstallationRepos = async (
  token: string,
  installationId: number,
  repos?: string[],
  filterById: boolean = false
) => {
  let allRepos: any[] = [];
  const matchedRepos: any[] = [];

  const octokit = createOctokitInstance(token);

  let page = 1;
  let hasMore = true;
  const perPage = 100;

  while (hasMore) {
    const response = await octokit.rest.apps.listInstallationReposForAuthenticatedUser({
      installation_id: installationId,
      per_page: perPage,
      page
    });

    if (response.data.repositories.length === 0) break;

    allRepos = allRepos.concat(response.data.repositories);

    if (repos) {
      const lowercaseRepos = repos.map((repo) => repo.toLowerCase());
      for (const repo of allRepos) {
        const matches = filterById
          ? lowercaseRepos.includes(repo.id.toString()) // Match by ID
          : lowercaseRepos.includes(repo.name.toLowerCase()); // Match by name

        if (matches && !matchedRepos.find((m: any) => m.id === repo.id)) {
          matchedRepos.push(repo);
        }
      }

      // Early exit if all desired repos are found
      if (matchedRepos.length === lowercaseRepos.length) {
        return matchedRepos;
      }
    }
    
    hasMore = (page * perPage <= response.data.total_count);
    page++;
  }

  return matchedRepos.length ? matchedRepos : allRepos;
};

export { getInstallations, getInstallationRepos };